import { Logger } from '@nestjs/common';
import type { components } from '@quizpulse/api-types';
import type { ErrorCode, HostView } from '@quizpulse/protocol';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GameGateway } from '../src/games/game.gateway.js';
import { GameService } from '../src/games/game.service.js';
import { GameStore } from '../src/games/game.store.js';
import { HistoryService } from '../src/games/history.service.js';
import { REDIS } from '../src/redis/redis.module.js';
import { createTestApp, type TestApp } from './support/app.js';
import { FakeClock } from './support/clock.js';
import { type Infra, startInfra } from './support/containers.js';
import { current, type HostWithQuiz, hostWithQuiz, joinPlayers, ok } from './support/games.js';
import { choiceQuestion, sampleQuiz } from './support/quiz-fixtures.js';
import { connectHost, connectPlayer, cookieOf, nextState, type TypedSocket } from './support/socket-client.js';

type GameCreated = components['schemas']['GameCreated'];
type GameDetail = components['schemas']['GameDetail'];
type AckResult = { ok: true } | { ok: false; code: ErrorCode };

function expectOk<T extends AckResult>(res: T): Extract<T, { ok: true }> {
    if (!res.ok) throw new Error(`expected ok, got ${(res as { code: ErrorCode }).code}`);
    return res as Extract<T, { ok: true }>;
}

const playerIn = (v: HostView, playerId: string) => v.players.find((p) => p.id === playerId);

const quiz = sampleQuiz({
    settings: { ...sampleQuiz().settings, earlyClose: false },
    questions: [choiceQuestion({ timeLimitSeconds: 5 })],
});

/**
 * Review Focus 3: the backend restarts in the middle of a question. A second app boots on the same Redis and
 * Postgres; nobody is online until they come back, the host finds the game paused, and the timers still work.
 */
describe('backend restart', () => {
    let infra: Infra;
    let clock: FakeClock;
    let app: TestApp;
    let host: HostWithQuiz;
    let gameId: string;
    let alice: { playerId: string; playerToken: string };
    let bob: { playerId: string };
    /** A game that finished while saving its history failed, and whose PIN and host slot were never freed. */
    let unsaved: { gameId: string; pin: string; hostId: string };
    /** A game whose history was saved but whose PIN and host slot were never freed. */
    let saved: { pin: string; hostId: string };
    /** A game with early close on, whose only connected-and-unanswered player drops with the restart. */
    let earlyClose: { gameId: string; answered: string; silent: string };
    /** What the second app warned about while starting. */
    let startupWarnings: unknown[][];
    let hostSocket: TypedSocket;
    const sockets: TypedSocket[] = [];

    const track = async (pending: Promise<TypedSocket>): Promise<TypedSocket> => {
        const socket = await pending;
        sockets.push(socket);
        return socket;
    };

    async function join(url: string, pin: string, nickname: string) {
        const socket = await track(connectPlayer(url));
        return { socket, ...expectOk(await socket.emitWithAck('player:join', { pin, nickname })) };
    }

    /** In the first app: a host and two players on a 5 s question, Alice has answered. */
    async function playUntilRestart(first: TestApp): Promise<void> {
        host = await hostWithQuiz(first.url, quiz);
        const res = await host.client.request('POST', '/api/v1/games', { body: { quizId: host.quizId } });
        expect(res.status).toBe(201);
        const created = (await res.json()) as GameCreated;
        gameId = created.gameId;
        const firstHost = await track(connectHost(first.url, cookieOf(host.client)));
        expectOk(await firstHost.emitWithAck('host:join', { gameId }));
        const firstAlice = await join(first.url, created.pin, 'Alice');
        alice = firstAlice;
        bob = await join(first.url, created.pin, 'Bob');
        const open = nextState(firstHost, 'host:state', (v) => v.phase === 'question_open');
        expectOk(await firstHost.emitWithAck('host:start', {}));
        await open;
        expectOk(
            await firstAlice.socket.emitWithAck('player:answer', {
                questionIndex: 0,
                answer: { kind: 'option', option: 0 },
            }),
        );
        const state = await current(first.app.get(GameStore), gameId);
        expect(state).toMatchObject({ phase: 'question_open', hostConnected: true });
        expect(Object.values(state.players).every((p) => p.connected)).toBe(true);
    }

    /** In the first app: a game is aborted mid-question while Postgres refuses the history, then "crashes". */
    async function finishWithoutHistory(first: TestApp): Promise<void> {
        const service = first.app.get(GameService);
        const store = first.app.get(GameStore);
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        vi.spyOn(first.app.get(HistoryService), 'persist').mockRejectedValue(new Error('database down'));
        const other = await hostWithQuiz(first.url, quiz);
        const created = await service.createGame(other.hostId, other.quizId);
        const [playerId = ''] = await joinPlayers(service, created.gameId, ['Carol']);
        await ok(service, created.gameId, { type: 'start' });
        await ok(service, created.gameId, {
            type: 'answer',
            playerId,
            questionIndex: 0,
            answer: { kind: 'option', option: 0 },
        });
        expect(await ok(service, created.gameId, { type: 'end' })).toMatchObject({ phase: 'finished' });
        // As if the process died between the failed save and freeing the PIN and the host slot.
        await first.app.get<Redis>(REDIS).set(`pin:${created.pin}`, created.gameId);
        expect(await store.claimHost(other.hostId, created.gameId)).toBe(true);
        vi.restoreAllMocks();
        unsaved = { gameId: created.gameId, pin: created.pin, hostId: other.hostId };
    }

    /** In the first app: a game is aborted and saved, then "crashes" before freeing the PIN and the host slot. */
    async function finishSavedButHeld(first: TestApp): Promise<void> {
        const service = first.app.get(GameService);
        const other = await hostWithQuiz(first.url, quiz);
        const created = await service.createGame(other.hostId, other.quizId);
        await joinPlayers(service, created.gameId, ['Gus']);
        await ok(service, created.gameId, { type: 'start' });
        await ok(service, created.gameId, { type: 'end' });
        await first.app.get<Redis>(REDIS).set(`pin:${created.pin}`, created.gameId);
        expect(await first.app.get(GameStore).claimHost(other.hostId, created.gameId)).toBe(true);
        saved = { pin: created.pin, hostId: other.hostId };
    }

    /** In the first app: early close on, host online, Dan has answered and Eve has not. */
    async function openWithEarlyClose(first: TestApp): Promise<void> {
        const service = first.app.get(GameService);
        const other = await hostWithQuiz(first.url, { ...quiz, settings: { ...quiz.settings, earlyClose: true } });
        const { gameId: id } = await service.createGame(other.hostId, other.quizId);
        await ok(service, id, { type: 'host_connection', connected: true });
        // Eve joined first, so she would be the first one marked offline, leaving only Dan, who has answered.
        const [silent = '', answered = ''] = await joinPlayers(service, id, ['Eve', 'Dan']);
        await ok(service, id, { type: 'start' });
        await ok(service, id, {
            type: 'answer',
            playerId: answered,
            questionIndex: 0,
            answer: { kind: 'option', option: 0 },
        });
        earlyClose = { gameId: id, answered, silent };
    }

    beforeAll(async () => {
        infra = await startInfra();
        clock = new FakeClock();
        const first = await createTestApp({ clock, infra });
        try {
            await playUntilRestart(first);
            await finishWithoutHistory(first);
            await finishSavedButHeld(first);
            await openWithEarlyClose(first);
            // No time passes for the game while the backend is down, so the paused question keeps its remaining time.
            clock.freeze();
        } finally {
            for (const socket of sockets.splice(0)) socket.close();
            await first.close();
        }
        const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        try {
            app = await createTestApp({ clock, infra });
        } finally {
            startupWarnings = [...warn.mock.calls];
            warn.mockRestore();
        }
        clock.unfreeze();
    });
    afterAll(async () => {
        for (const socket of sockets.splice(0)) socket.close();
        await app.close();
        await infra.stop();
    });

    it('players offline after restart until they rejoin', async () => {
        hostSocket = await track(connectHost(app.url, cookieOf(host.client)));
        const snapshot = nextState(hostSocket, 'host:state');
        expectOk(await hostSocket.emitWithAck('host:join', { gameId }));
        const view = await snapshot;
        expect(playerIn(view, alice.playerId)?.connected).toBe(false);
        expect(playerIn(view, bob.playerId)?.connected).toBe(false);

        const back = await track(connectPlayer(app.url));
        const online = nextState(hostSocket, 'host:state', (v) => playerIn(v, alice.playerId)?.connected === true);
        const playerSnapshot = nextState(back, 'player:state');
        expectOk(await back.emitWithAck('player:rejoin', { gameId, playerToken: alice.playerToken }));
        expect(await playerSnapshot).toMatchObject({ phase: 'question_open', answered: true });
        const after = await online;
        expect(playerIn(after, bob.playerId)?.connected).toBe(false);
    });

    it('host sees pause after restart and can resume', async () => {
        const state = await current(app.app.get(GameStore), gameId);
        expect(state).toMatchObject({ phase: 'question_open', hostConnected: true, pause: { reason: 'host' } });
        expect(state.question?.remainingMsAtPause).toBeGreaterThan(0);

        const resumed = nextState(hostSocket, 'host:state', (v) => v.pause === null);
        expectOk(await hostSocket.emitWithAck('host:resume', {}));
        expect(await resumed).toMatchObject({ phase: 'question_open', questionIndex: 0 });
    });

    it("deadline timer still fires after resume and the first player's answer counts", async () => {
        const closed = await nextState(hostSocket, 'host:state', (v) => v.phase === 'question_results');
        expect(playerIn(closed, alice.playerId)?.score).toBeGreaterThan(0);
        expect(playerIn(closed, bob.playerId)?.score).toBe(0);
        const state = await current(app.app.get(GameStore), gameId);
        expect(state.answers[0]?.[alice.playerId]).toMatchObject({ correct: true });
    });

    it('players dropping with the restart do not close an open question early', async () => {
        const state = await current(app.app.get(GameStore), earlyClose.gameId);
        expect(state).toMatchObject({
            phase: 'question_open',
            hostConnected: false,
            pause: { reason: 'host_disconnected' },
        });
        expect(state.players[earlyClose.answered]?.connected).toBe(false);
        expect(state.players[earlyClose.silent]?.connected).toBe(false);
    });

    it('a finished game whose history was not saved is saved on startup', async () => {
        expect(startupWarnings).toContainEqual([
            expect.stringContaining(`game ${unsaved.gameId}: finished without saved history`),
        ]);
        const detail: GameDetail = await app.app.get(HistoryService).get(unsaved.hostId, unsaved.gameId);
        expect(detail).toMatchObject({ gameId: unsaved.gameId, status: 'aborted' });
        expect(detail.players.map((p) => p.nickname)).toEqual(['Carol']);
        // The question was open when the game was aborted: it was never scored, so its answers are not kept.
        expect(detail.questions.flatMap((q) => q.answers)).toEqual([]);
        const store = app.app.get(GameStore);
        expect(await store.gameIdByPin(unsaved.pin)).toBeNull();
        expect(await store.activeGameOf(unsaved.hostId)).toBeNull();
    });

    it('a finished game whose history is already saved still frees its PIN and host slot', async () => {
        const store = app.app.get(GameStore);
        expect(await store.gameIdByPin(saved.pin)).toBeNull();
        expect(await store.activeGameOf(saved.hostId)).toBeNull();
    });

    it('a failing presence query counts as offline during recovery', async () => {
        const service = app.app.get(GameService);
        const other = await hostWithQuiz(app.url, quiz);
        const created = await service.createGame(other.hostId, other.quizId);
        const [playerId = ''] = await joinPlayers(service, created.gameId, ['Fay']);
        await ok(service, created.gameId, { type: 'host_connection', connected: true });
        await ok(service, created.gameId, { type: 'start' });
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const gateway = app.app.get(GameGateway);
        vi.spyOn(gateway, 'isHostOnline').mockRejectedValue(new Error('redis down'));
        vi.spyOn(gateway, 'isPlayerOnline').mockRejectedValue(new Error('redis down'));
        try {
            await service.onApplicationBootstrap();
        } finally {
            vi.restoreAllMocks();
        }
        const state = await current(app.app.get(GameStore), created.gameId);
        expect(state.hostConnected).toBe(false);
        expect(state.players[playerId]?.connected).toBe(false);
    });
});
