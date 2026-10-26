import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { components } from '@quizpulse/api-types';
import { HOST_ABSENT_MS } from '@quizpulse/protocol';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { AppError } from '../src/common/errors.js';
import { GameService } from '../src/games/game.service.js';
import { GameStore } from '../src/games/game.store.js';
import { GameGateway } from '../src/games/game.gateway.js';
import { TIMER_QUEUE } from '../src/games/game.timers.js';
import { REDIS } from '../src/redis/redis.module.js';
import { createTestApp, type TestApp } from './support/app.js';
import { FakeClock } from './support/clock.js';
import { current, hostWithQuiz, joinPlayers, ok, RecordingBroadcaster, waitFor } from './support/games.js';
import { choiceQuestion, sampleQuiz } from './support/quiz-fixtures.js';

type GameCreated = components['schemas']['GameCreated'];

const PUBLIC_BASE_URL = 'http://192.168.1.50:8080';

describe('game service', () => {
    let ctx: TestApp;
    let clock: FakeClock;
    let store: GameStore;
    let service: GameService;
    let broadcaster: RecordingBroadcaster;

    beforeAll(async () => {
        clock = new FakeClock();
        ctx = await createTestApp({ clock, config: { publicBaseUrl: PUBLIC_BASE_URL } });
        store = ctx.app.get(GameStore);
        service = ctx.app.get(GameService);
        broadcaster = new RecordingBroadcaster();
        service.setBroadcaster(broadcaster);
    });
    afterAll(async () => {
        await ctx.close();
    });

    it('createGame returns 6-digit pin and joinUrl from PUBLIC_BASE_URL', async () => {
        const { client, quizId } = await hostWithQuiz(ctx.url);
        const res = await client.request('POST', '/api/v1/games', { body: { quizId } });
        expect(res.status).toBe(201);
        const created = (await res.json()) as GameCreated;
        expect(created.pin).toMatch(/^\d{6}$/);
        expect(created.joinUrl).toBe(`${PUBLIC_BASE_URL}/play?pin=${created.pin}`);

        const active = await client.request('GET', '/api/v1/games/active');
        expect(active.status).toBe(200);
        expect(await active.json()).toEqual(created);
        expect(await store.gameIdByPin(created.pin)).toBe(created.gameId);
        expect(await current(store, created.gameId)).toMatchObject({ phase: 'lobby', pin: created.pin });
    });

    it('a new game waits for its host: offline, host_absent scheduled in 30 min, which closes the lobby', async () => {
        const { hostId, quizId } = await hostWithQuiz(ctx.url);
        const { gameId } = await service.createGame(hostId, quizId);
        const state = await current(store, gameId);
        expect(state).toMatchObject({ phase: 'lobby', hostConnected: false });

        const connection = new Redis(ctx.config.redisUrl, { maxRetriesPerRequest: null });
        const queue = new Queue(TIMER_QUEUE, { connection });
        try {
            const job = await queue.getJob(`${gameId}:host_absent:${String(state.hostEpoch)}`);
            expect(job?.data).toEqual({
                gameId,
                timer: 'host_absent',
                epoch: state.hostEpoch,
                at: state.createdAt + HOST_ABSENT_MS,
            });
        } finally {
            await queue.close();
            await connection.quit();
        }

        // What the job does when the host never opens a socket.
        await ok(service, gameId, { type: 'timer_fired', timer: 'host_absent', epoch: state.hostEpoch });
        expect(await store.get(gameId)).toBeNull();
        expect(broadcaster.closedGames).toContain(gameId);
        expect(await store.activeGameOf(hostId)).toBeNull();
    });

    it('unknown or foreign quiz -> 404, no session -> 401, no active game -> 404', async () => {
        const { client } = await hostWithQuiz(ctx.url);
        const other = await hostWithQuiz(ctx.url);
        for (const quizId of [other.quizId, '00000000-0000-4000-8000-000000000000']) {
            const res = await client.request('POST', '/api/v1/games', { body: { quizId } });
            expect(res.status).toBe(404);
            expect(await res.json()).toEqual({ code: 'NOT_FOUND' });
        }
        const none = await client.request('GET', '/api/v1/games/active');
        expect(none.status).toBe(404);
        expect(await none.json()).toEqual({ code: 'NOT_FOUND' });
        client.cookies.clear();
        expect((await client.request('GET', '/api/v1/games/active')).status).toBe(401);
    });

    it('second active game → 409 ACTIVE_GAME_EXISTS with gameId', async () => {
        const { client, quizId } = await hostWithQuiz(ctx.url);
        const first = (await (
            await client.request('POST', '/api/v1/games', { body: { quizId } })
        ).json()) as GameCreated;
        const second = await client.request('POST', '/api/v1/games', { body: { quizId } });
        expect(second.status).toBe(409);
        expect(await second.json()).toEqual({ code: 'ACTIVE_GAME_EXISTS', gameId: first.gameId });
    });

    it('concurrent creates for one host yield one game', async () => {
        const { hostId, quizId } = await hostWithQuiz(ctx.url);
        // Hold both creates right before they claim the host slot, so they race for it.
        const claim = store.claimHost.bind(store);
        let arrived = 0;
        let openGate = (): void => undefined;
        const gate = new Promise<void>((resolve) => {
            openGate = resolve;
        });
        const spy = vi.spyOn(store, 'claimHost').mockImplementation(async (host, game) => {
            arrived += 1;
            if (arrived === 2) openGate();
            await gate;
            return claim(host, game);
        });
        // A slow state write: if the slot were claimed before the state exists, the other create would see an
        // "expired" slot during this window and steal it.
        const create = store.create.bind(store);
        const slowCreate = vi.spyOn(store, 'create').mockImplementation(async (state) => {
            await new Promise((resolve) => setTimeout(resolve, 300));
            await create(state);
        });
        try {
            const results = await Promise.allSettled([
                service.createGame(hostId, quizId),
                service.createGame(hostId, quizId),
            ]);
            const created = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
            const rejected = results.flatMap((r) => (r.status === 'rejected' ? [r.reason as AppError] : []));
            expect(created).toHaveLength(1);
            expect(rejected).toHaveLength(1);
            const [winner] = created;
            expect(rejected[0]).toMatchObject({
                code: 'ACTIVE_GAME_EXISTS',
                status: 409,
                extra: { gameId: winner?.gameId },
            });
            expect(await store.activeGameOf(hostId)).toBe(winner?.gameId);
            // The loser cleaned up its state and PIN: only the winner's game exists, and no PIN is orphaned.
            const active = await Promise.all((await store.listActiveGameIds()).map((id) => store.get(id)));
            expect(active.filter((st) => st?.hostId === hostId).map((st) => st?.gameId)).toEqual([winner?.gameId]);
            const redis = ctx.app.get<Redis>(REDIS);
            for (const key of await redis.keys('pin:*')) {
                const owner = await redis.get(key);
                expect(owner === null ? null : await store.get(owner), key).not.toBeNull();
            }
        } finally {
            spy.mockRestore();
            slowCreate.mockRestore();
        }
    });

    it('a slot left by an expired game is reclaimed', async () => {
        const { hostId, quizId } = await hostWithQuiz(ctx.url);
        const ghost = randomUUID();
        expect(await store.claimHost(hostId, ghost)).toBe(true);
        const { gameId } = await service.createGame(hostId, quizId);
        expect(await store.activeGameOf(hostId)).toBe(gameId);
    });

    it('50 concurrent commands on one game all apply', async () => {
        const { hostId, quizId } = await hostWithQuiz(ctx.url);
        const { gameId } = await service.createGame(hostId, quizId);
        const ids = Array.from({ length: 50 }, () => randomUUID());
        const joins = await Promise.all(
            ids.map((playerId, i) =>
                service.execute(gameId, { type: 'player_join', playerId, nickname: `P${String(i)}` }),
            ),
        );
        expect(joins.map((r) => (r.ok ? 'ok' : r.code))).toEqual(ids.map(() => 'ok'));
        const disconnects = await Promise.all(
            ids.map((playerId) => service.execute(gameId, { type: 'player_connection', playerId, connected: false })),
        );
        expect(disconnects.every((r) => r.ok)).toBe(true);
        const state = await current(store, gameId);
        expect(state.playerOrder).toHaveLength(50);
        expect(new Set(state.playerOrder)).toEqual(new Set(ids));
        expect(Object.values(state.players).every((p) => !p.connected)).toBe(true);
    });

    it('deadline timer fires via BullMQ and closes question', async () => {
        const quiz = sampleQuiz({
            settings: { ...sampleQuiz().settings, earlyClose: false },
            questions: [choiceQuestion({ timeLimitSeconds: 5 })],
        });
        const { hostId, quizId } = await hostWithQuiz(ctx.url, quiz);
        const { gameId } = await service.createGame(hostId, quizId);
        const [playerId = ''] = await joinPlayers(service, gameId, ['Alice']);
        await ok(service, gameId, { type: 'start' });
        await ok(service, gameId, {
            type: 'answer',
            playerId,
            questionIndex: 0,
            answer: { kind: 'option', option: 0 },
        });

        await waitFor(async () => (await current(store, gameId)).phase === 'question_results', 7_000);
        const state = await current(store, gameId);
        expect(state.answers[0]?.[playerId]).toMatchObject({ correct: true });
        expect(state.players[playerId]?.score).toBeGreaterThan(0);
        expect(broadcaster.published.at(-1)).toMatchObject({ gameId, phase: 'question_results' });
    });

    it('stale timer does not change state', async () => {
        const { hostId, quizId } = await hostWithQuiz(ctx.url);
        const { gameId } = await service.createGame(hostId, quizId);
        await joinPlayers(service, gameId, ['Bob']);
        const started = await ok(service, gameId, { type: 'start' });
        const paused = await ok(service, gameId, { type: 'pause' });
        expect(paused.timerEpoch).toBeGreaterThan(started.timerEpoch);

        clock.advance(60_000);
        const result = await service.execute(gameId, {
            type: 'timer_fired',
            timer: 'question_deadline',
            epoch: started.timerEpoch,
        });
        expect(result.ok).toBe(true);
        expect(await current(store, gameId)).toEqual(paused);
    });

    it('lobby end deletes game and frees pin', async () => {
        const { client, hostId, quizId } = await hostWithQuiz(ctx.url);
        const { gameId, pin } = await service.createGame(hostId, quizId);
        const [playerId = ''] = await joinPlayers(service, gameId, ['Carol']);
        const token = await store.issuePlayerToken(gameId, playerId);
        const publishedBefore = broadcaster.published.length;

        const ended = await service.execute(gameId, { type: 'end' });
        expect(ended.ok).toBe(true);
        expect(await store.get(gameId)).toBeNull();
        expect(await store.gameIdByPin(pin)).toBeNull();
        expect(await store.activeGameOf(hostId)).toBeNull();
        expect(broadcaster.closedGames).toContain(gameId);
        expect(broadcaster.published.length).toBe(publishedBefore);
        expect(await store.playerIdByToken(gameId, token)).toBeNull();
        expect(await ctx.app.get<Redis>(REDIS).exists(`game:${gameId}:tokens`)).toBe(0);

        expect(await service.execute(gameId, { type: 'start' })).toEqual({ ok: false, code: 'GAME_NOT_FOUND' });
        expect(await service.execute(gameId, { type: 'timer_fired', timer: 'host_absent', epoch: 0 })).toEqual({
            ok: false,
            code: 'GAME_NOT_FOUND',
        });
        expect(broadcaster.published.length).toBe(publishedBefore);
        expect((await client.request('GET', '/api/v1/games/active')).status).toBe(404);
        const again = await client.request('POST', '/api/v1/games', { body: { quizId } });
        expect(again.status).toBe(201);
    });

    it('a deadline job lost before a restart is re-scheduled on bootstrap and still closes the question', async () => {
        const quiz = sampleQuiz({
            settings: { ...sampleQuiz().settings, earlyClose: false },
            questions: [choiceQuestion({ timeLimitSeconds: 5 })],
        });
        const { hostId, quizId } = await hostWithQuiz(ctx.url, quiz);
        const { gameId } = await service.createGame(hostId, quizId);
        await joinPlayers(service, gameId, ['Erin']);
        const open = await ok(service, gameId, { type: 'start' });
        const connection = new Redis(ctx.config.redisUrl, { maxRetriesPerRequest: null });
        const queue = new Queue<{ at: number }>(TIMER_QUEUE, { connection });
        try {
            const jobId = `${gameId}:question_deadline:${String(open.timerEpoch)}`;
            const job = await queue.getJob(jobId);
            expect(job).toBeDefined();
            await job?.remove();
            expect(await queue.getJob(jobId)).toBeUndefined();

            // Everybody stays "online" so the restart changes nothing but the timers.
            const gateway = ctx.app.get(GameGateway);
            vi.spyOn(gateway, 'isHostOnline').mockResolvedValue(true);
            vi.spyOn(gateway, 'isPlayerOnline').mockResolvedValue(true);
            try {
                await service.onApplicationBootstrap();
            } finally {
                vi.restoreAllMocks();
            }
            const rescheduled = await queue.getJob(jobId);
            expect(rescheduled?.data).toMatchObject({ gameId, epoch: open.timerEpoch, at: open.question?.closesAt });
            // The lobby's host_absent job still exists and keeps its time (same job id, so not added twice).
            const absent = await queue.getJob(`${gameId}:host_absent:${String(open.hostEpoch)}`);
            expect(absent?.data.at).toBe(open.hostAbsentAt);
        } finally {
            await queue.close();
            await connection.quit();
        }
        await waitFor(async () => (await current(store, gameId)).phase === 'question_results', 8_000);
    });

    it('kick notifies the broadcaster', async () => {
        const { hostId, quizId } = await hostWithQuiz(ctx.url);
        const { gameId } = await service.createGame(hostId, quizId);
        const [playerId = ''] = await joinPlayers(service, gameId, ['Dave']);
        await ok(service, gameId, { type: 'kick', playerId });
        expect(broadcaster.kickedPlayers).toContainEqual({ gameId, playerId });
    });
});
