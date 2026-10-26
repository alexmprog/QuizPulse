import { Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { components } from '@quizpulse/api-types';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/db/client.js';
import { DB } from '../src/db/db.module.js';
import { gameAnswers, gamePlayers, games } from '../src/db/schema.js';
import { GameService } from '../src/games/game.service.js';
import { GameStore } from '../src/games/game.store.js';
import { HistoryService } from '../src/games/history.service.js';
import { createTestApp, type TestApp } from './support/app.js';
import { FakeClock } from './support/clock.js';
import { current, hostWithQuiz, joinPlayers, ok, RecordingBroadcaster } from './support/games.js';
import { registerHost } from './support/hosts.js';
import { choiceQuestion, numericQuestion, sampleQuiz } from './support/quiz-fixtures.js';

type GameSummary = components['schemas']['GameSummary'];
type GameDetail = components['schemas']['GameDetail'];

const quiz = sampleQuiz({
    title: 'History quiz',
    settings: { ...sampleQuiz().settings, earlyClose: false, leaderboardEvery: 0 },
    questions: [choiceQuestion({ timeLimitSeconds: 10 }), numericQuestion({ timeLimitSeconds: 10 })],
});

describe('history', () => {
    let ctx: TestApp;
    let clock: FakeClock;
    let store: GameStore;
    let service: GameService;
    let history: HistoryService;
    let db: Database;

    beforeAll(async () => {
        clock = new FakeClock();
        ctx = await createTestApp({ clock });
        store = ctx.app.get(GameStore);
        service = ctx.app.get(GameService);
        history = ctx.app.get(HistoryService);
        db = ctx.app.get<Database>(DB);
    });
    afterAll(async () => {
        await ctx.close();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** Closes the open question the way its deadline timer would. */
    async function closeQuestion(gameId: string): Promise<void> {
        clock.advance(10_000);
        const state = await current(store, gameId);
        await ok(service, gameId, { type: 'timer_fired', timer: 'question_deadline', epoch: state.timerEpoch });
    }

    /** Alice is right on Q1, Bob is right on the double-points Q2, Carol never answers. */
    async function playGame(gameId: string): Promise<{ alice: string; bob: string; carol: string }> {
        const [alice = '', bob = '', carol = ''] = await joinPlayers(service, gameId, ['Alice', 'Bob', 'Carol']);
        await ok(service, gameId, { type: 'start' });
        clock.advance(1_000);
        await ok(service, gameId, {
            type: 'answer',
            playerId: alice,
            questionIndex: 0,
            answer: { kind: 'option', option: 0 },
        });
        await ok(service, gameId, {
            type: 'answer',
            playerId: bob,
            questionIndex: 0,
            answer: { kind: 'option', option: 1 },
        });
        await closeQuestion(gameId);
        await ok(service, gameId, { type: 'next' });
        clock.advance(2_000);
        await ok(service, gameId, {
            type: 'answer',
            playerId: bob,
            questionIndex: 1,
            answer: { kind: 'numeric', value: 8 },
        });
        await ok(service, gameId, {
            type: 'answer',
            playerId: alice,
            questionIndex: 1,
            answer: { kind: 'numeric', value: 3 },
        });
        await closeQuestion(gameId);
        return { alice, bob, carol };
    }

    it('finished game persisted with players, ranks and answers', async () => {
        const { client, hostId, quizId } = await hostWithQuiz(ctx.url, quiz);
        const { gameId, pin } = await service.createGame(hostId, quizId);
        const { alice, bob, carol } = await playGame(gameId);
        const finished = await ok(service, gameId, { type: 'next' });
        expect(finished.phase).toBe('finished');

        const list = await client.request('GET', '/api/v1/history');
        expect(list.status).toBe(200);
        const summaries = (await list.json()) as GameSummary[];
        expect(summaries).toHaveLength(1);
        expect(summaries[0]).toMatchObject({
            gameId,
            quizTitle: 'History quiz',
            status: 'completed',
            playerCount: 3,
            winner: { nickname: 'Bob', score: finished.players[bob]?.score },
        });

        const res = await client.request('GET', `/api/v1/history/${gameId}`);
        expect(res.status).toBe(200);
        const detail = (await res.json()) as GameDetail;
        expect(detail).toMatchObject({ gameId, quizTitle: 'History quiz', status: 'completed' });
        expect(Date.parse(detail.endedAt)).toBeGreaterThanOrEqual(Date.parse(detail.startedAt));
        expect(detail.players).toEqual([
            { playerId: bob, nickname: 'Bob', finalScore: finished.players[bob]?.score, finalRank: 1 },
            { playerId: alice, nickname: 'Alice', finalScore: finished.players[alice]?.score, finalRank: 2 },
            { playerId: carol, nickname: 'Carol', finalScore: 0, finalRank: 3 },
        ]);
        expect(detail.questions.map((q) => [q.position, q.type, q.text])).toEqual([
            [0, 'single_choice', 'Capital of France?'],
            [1, 'numeric', 'How many legs does a spider have?'],
        ]);
        const [q1, q2] = detail.questions;
        expect(q1).toMatchObject({ options: ['Paris', 'Rome', 'Berlin'], correctOption: 0, multiplier: 1 });
        expect(q2).toMatchObject({
            options: [],
            correctOption: null,
            numericAnswer: 8,
            numericTolerance: 0,
            multiplier: 2,
        });
        expect(q1?.answers).toHaveLength(2);
        expect(q1?.answers).toContainEqual({
            playerId: alice,
            answer: { kind: 'option', option: 0 },
            activeMs: finished.answers[0]?.[alice]?.activeMs,
            points: finished.answers[0]?.[alice]?.points,
            correct: true,
        });
        expect(q1?.answers).toContainEqual(
            expect.objectContaining({
                playerId: bob,
                points: 0,
                correct: false,
                answer: { kind: 'option', option: 1 },
            }),
        );
        expect(q2?.answers).toContainEqual(
            expect.objectContaining({ playerId: bob, correct: true, answer: { kind: 'numeric', value: 8 } }),
        );

        // The finished game frees the pin and the host slot; its state expires within the hour.
        expect(await store.gameIdByPin(pin)).toBeNull();
        expect(await store.activeGameOf(hostId)).toBeNull();
        expect((await client.request('GET', '/api/v1/games/active')).status).toBe(404);
    });

    it('aborted game has status aborted', async () => {
        const { client, hostId, quizId } = await hostWithQuiz(ctx.url, quiz);
        const { gameId } = await service.createGame(hostId, quizId);
        const [alice = ''] = await joinPlayers(service, gameId, ['Alice']);
        await ok(service, gameId, { type: 'start' });
        await ok(service, gameId, {
            type: 'answer',
            playerId: alice,
            questionIndex: 0,
            answer: { kind: 'option', option: 0 },
        });
        await ok(service, gameId, { type: 'end' });

        const detail = (await (await client.request('GET', `/api/v1/history/${gameId}`)).json()) as GameDetail;
        expect(detail.status).toBe('aborted');
        expect(detail.players).toEqual([{ playerId: alice, nickname: 'Alice', finalScore: 0, finalRank: 1 }]);
        // The question that was open when the game stopped was never scored, so its answers are not kept.
        expect(detail.questions.flatMap((q) => q.answers)).toEqual([]);
        const [summary] = (await (await client.request('GET', '/api/v1/history')).json()) as GameSummary[];
        expect(summary).toMatchObject({ gameId, status: 'aborted', playerCount: 1 });
    });

    it('persist twice is idempotent', async () => {
        const { hostId, quizId } = await hostWithQuiz(ctx.url, quiz);
        const { gameId } = await service.createGame(hostId, quizId);
        await playGame(gameId);
        await ok(service, gameId, { type: 'next' });
        const state = await current(store, gameId);

        await history.persist(state);
        expect(await db.select().from(games).where(eq(games.id, gameId))).toHaveLength(1);
        expect(await db.select().from(gamePlayers).where(eq(gamePlayers.gameId, gameId))).toHaveLength(3);
        expect(await db.select().from(gameAnswers).where(eq(gameAnswers.gameId, gameId))).toHaveLength(4);
    });

    it('other host gets 404', async () => {
        const { hostId, quizId } = await hostWithQuiz(ctx.url, quiz);
        const { gameId } = await service.createGame(hostId, quizId);
        await ok(service, gameId, { type: 'player_join', playerId: crypto.randomUUID(), nickname: 'Solo' });
        await ok(service, gameId, { type: 'start' });
        await ok(service, gameId, { type: 'end' });

        const other = await registerHost(ctx.url);
        const res = await other.request('GET', `/api/v1/history/${gameId}`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: 'NOT_FOUND' });
        expect(await (await other.request('GET', '/api/v1/history')).json()).toEqual([]);
        expect((await other.request('GET', '/api/v1/history/not-a-uuid')).status).toBe(400);
    });

    it('quiz deleted during game → history saved with quiz_id null and original title', async () => {
        const { client, hostId, quizId } = await hostWithQuiz(ctx.url, quiz);
        const { gameId } = await service.createGame(hostId, quizId);
        await joinPlayers(service, gameId, ['Alice']);
        await ok(service, gameId, { type: 'start' });
        expect((await client.request('DELETE', `/api/v1/quizzes/${quizId}`)).status).toBe(204);

        await closeQuestion(gameId);
        await ok(service, gameId, { type: 'next' });
        await closeQuestion(gameId);
        const finished = await ok(service, gameId, { type: 'next' });
        expect(finished.phase).toBe('finished');

        const [row] = await db.select().from(games).where(eq(games.id, gameId));
        expect(row).toMatchObject({ quizId: null, quizTitle: 'History quiz', status: 'completed' });
        const detail = (await (await client.request('GET', `/api/v1/history/${gameId}`)).json()) as GameDetail;
        expect(detail.quizTitle).toBe('History quiz');
        expect(detail.questions).toHaveLength(2);
    });

    it('quiz edited during game does not change running snapshot', async () => {
        const { client, hostId, quizId } = await hostWithQuiz(ctx.url, quiz);
        const { gameId } = await service.createGame(hostId, quizId);
        await joinPlayers(service, gameId, ['Alice']);
        await ok(service, gameId, { type: 'start' });
        const before = await current(store, gameId);
        const edited = sampleQuiz({ title: 'Edited', questions: [choiceQuestion({ text: 'Edited question?' })] });
        expect((await client.request('PUT', `/api/v1/quizzes/${quizId}`, { body: edited })).status).toBe(200);

        expect((await current(store, gameId)).quiz).toEqual(before.quiz);
        await ok(service, gameId, { type: 'end' });
        const detail = (await (await client.request('GET', `/api/v1/history/${gameId}`)).json()) as GameDetail;
        expect(detail.quizTitle).toBe('History quiz');
        expect(detail.questions.map((q) => q.text)).toEqual([
            'Capital of France?',
            'How many legs does a spider have?',
        ]);
        const [row] = await db.select().from(games).where(eq(games.id, gameId));
        expect(row?.quizId).toBe(quizId);
    });

    it('abort while paused by host disconnect → host_absent → aborted without the open question', async () => {
        const { client, hostId, quizId } = await hostWithQuiz(ctx.url, quiz);
        const { gameId } = await service.createGame(hostId, quizId);
        const [alice = ''] = await joinPlayers(service, gameId, ['Alice']);
        await ok(service, gameId, { type: 'start' });
        await ok(service, gameId, {
            type: 'answer',
            playerId: alice,
            questionIndex: 0,
            answer: { kind: 'option', option: 0 },
        });
        const paused = await ok(service, gameId, { type: 'host_connection', connected: false });
        expect(paused.pause).toMatchObject({ reason: 'host_disconnected' });
        clock.advance(30 * 60 * 1000);
        const aborted = await ok(service, gameId, {
            type: 'timer_fired',
            timer: 'host_absent',
            epoch: paused.hostEpoch,
        });
        expect(aborted).toMatchObject({ phase: 'finished', outcome: 'aborted' });

        const detail = (await (await client.request('GET', `/api/v1/history/${gameId}`)).json()) as GameDetail;
        expect(detail.status).toBe('aborted');
        expect(detail.players).toEqual([{ playerId: alice, nickname: 'Alice', finalScore: 0, finalRank: 1 }]);
        expect(detail.questions.flatMap((q) => q.answers)).toEqual([]);
    });

    it('history lands when saving fails once', async () => {
        const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const persist = history.persist.bind(history);
        const spy = vi
            .spyOn(history, 'persist')
            .mockRejectedValueOnce(new Error('database hiccup'))
            .mockImplementation((state) => persist(state));
        const { hostId, quizId } = await hostWithQuiz(ctx.url, quiz);
        const { gameId } = await service.createGame(hostId, quizId);
        await joinPlayers(service, gameId, ['Alice']);
        await ok(service, gameId, { type: 'start' });
        await ok(service, gameId, { type: 'end' });

        expect(spy).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledOnce();
        expect(await db.select().from(games).where(eq(games.id, gameId))).toHaveLength(1);
    });

    it('finished state is still published when saving always fails', async () => {
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const spy = vi.spyOn(history, 'persist').mockRejectedValue(new Error('database down'));
        const broadcaster = new RecordingBroadcaster();
        service.setBroadcaster(broadcaster);
        const { client, hostId, quizId } = await hostWithQuiz(ctx.url, quiz);
        const { gameId, pin } = await service.createGame(hostId, quizId);
        await joinPlayers(service, gameId, ['Alice']);
        await ok(service, gameId, { type: 'start' });

        const result = await service.execute(gameId, { type: 'end' });
        expect(result).toMatchObject({ ok: true, state: { phase: 'finished', outcome: 'aborted' } });
        expect(spy).toHaveBeenCalledTimes(3);
        expect(error).toHaveBeenCalledWith(expect.stringContaining('effect persist_history failed'));
        expect(broadcaster.published.at(-1)).toMatchObject({ gameId, phase: 'finished' });
        expect(await db.select().from(games).where(eq(games.id, gameId))).toHaveLength(0);
        // The host is not stuck with a game that is over.
        expect(await store.gameIdByPin(pin)).toBeNull();
        expect((await client.request('GET', '/api/v1/games/active')).status).toBe(404);
    });
});
