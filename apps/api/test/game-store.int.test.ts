import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameService } from '../src/games/game.service.js';
import { GameStore } from '../src/games/game.store.js';
import { createTestApp, type TestApp } from './support/app.js';
import { FakeClock } from './support/clock.js';
import { current, hostWithQuiz, joinPlayers, ok } from './support/games.js';
import { choiceQuestion, sampleQuiz } from './support/quiz-fixtures.js';

describe('game store', () => {
    let ctx: TestApp;
    let store: GameStore;
    let service: GameService;
    let redis: Redis;

    beforeAll(async () => {
        ctx = await createTestApp({ clock: new FakeClock() });
        store = ctx.app.get(GameStore);
        service = ctx.app.get(GameService);
        redis = new Redis(ctx.config.redisUrl);
    });
    afterAll(async () => {
        await redis.quit();
        await ctx.close();
    });

    async function startedGame(players: number): Promise<{ gameId: string; playerIds: string[] }> {
        const quiz = sampleQuiz({
            settings: { ...sampleQuiz().settings, earlyClose: false },
            questions: [choiceQuestion()],
        });
        const { hostId, quizId } = await hostWithQuiz(ctx.url, quiz);
        const { gameId } = await service.createGame(hostId, quizId);
        const playerIds = await joinPlayers(
            service,
            gameId,
            Array.from({ length: players }, (_, i) => `Player ${String(i + 1)}`),
        );
        await ok(service, gameId, { type: 'start' });
        return { gameId, playerIds };
    }

    it('update is atomic under concurrency', async () => {
        const { gameId, playerIds } = await startedGame(10);
        const [first = ''] = playerIds;

        // The same player answers twice at once (double tap / two tabs): exactly one answer is accepted.
        const answer = {
            type: 'answer',
            playerId: first,
            questionIndex: 0,
            answer: { kind: 'option', option: 0 },
        } as const;
        const results = await Promise.all([service.execute(gameId, answer), service.execute(gameId, answer)]);
        const outcomes = results.map((r) => (r.ok ? 'ok' : r.code)).sort();
        expect(outcomes).toEqual(['ALREADY_ANSWERED', 'ok']);

        // Different players answering at once all get through: no lost update despite write conflicts.
        const others = await Promise.all(
            playerIds
                .slice(1)
                .map((playerId) =>
                    service.execute(gameId, { ...answer, playerId, answer: { kind: 'option', option: 1 } }),
                ),
        );
        expect(others.every((r) => r.ok)).toBe(true);
        const state = await current(store, gameId);
        expect(Object.keys(state.answers[0] ?? {}).sort()).toEqual([...playerIds].sort());
        expect(state.answers[0]?.[first]?.answer).toEqual({ kind: 'option', option: 0 });
    });

    it('pin is unique among active games', async () => {
        const pins = new Map<string, string>();
        for (let i = 0; i < 300; i += 1) {
            const gameId = randomUUID();
            const pin = await store.allocatePin(gameId);
            expect(pin).toMatch(/^\d{6}$/);
            expect(pins.has(pin)).toBe(false);
            pins.set(pin, gameId);
        }
        for (const [pin, gameId] of pins) expect(await store.gameIdByPin(pin)).toBe(gameId);

        const [[pin = '', gameId = ''] = []] = pins;
        expect(await redis.set(`pin:${pin}`, randomUUID(), 'NX')).toBeNull();
        expect(await store.gameIdByPin(pin)).toBe(gameId);
        await store.releasePin(pin);
        expect(await store.gameIdByPin(pin)).toBeNull();
        expect(await redis.ttl(`pin:${[...pins.keys()][1] ?? ''}`)).toBeGreaterThan(0);
    });

    it('player token roundtrip, unknown token → null', async () => {
        const { gameId, playerIds } = await startedGame(1);
        const [playerId = ''] = playerIds;
        const token = await store.issuePlayerToken(gameId, playerId);
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(await store.playerIdByToken(gameId, token)).toBe(playerId);
        expect(await store.playerIdByToken(gameId, `${token.slice(0, -1)}x`)).toBeNull();
        expect(await store.playerIdByToken(gameId, 'nonsense')).toBeNull();
        expect(await store.playerIdByToken(randomUUID(), token)).toBeNull();

        // Only the hash is stored.
        const stored = await redis.hgetall(`game:${gameId}:tokens`);
        expect(Object.values(stored)).toEqual([playerId]);
        expect(Object.keys(stored)).not.toContain(token);
    });

    it('lists active games and refreshes the state, PIN and host TTLs', async () => {
        const { gameId } = await startedGame(1);
        expect(await store.listActiveGameIds()).toContain(gameId);
        expect((await store.listFinishedGames()).map((s) => s.gameId)).not.toContain(gameId);
        const ttl = await redis.ttl(`game:${gameId}:state`);
        expect(ttl).toBeGreaterThan(23 * 60 * 60);

        // Every write renews the PIN and the host slot together with the state.
        const { pin, hostId } = await current(store, gameId);
        await redis.expire(`pin:${pin}`, 100);
        await redis.expire(`host:${hostId}:active`, 100);
        await ok(service, gameId, { type: 'pause' });
        expect(await redis.ttl(`pin:${pin}`)).toBeGreaterThan(23 * 60 * 60);
        expect(await redis.ttl(`host:${hostId}:active`)).toBeGreaterThan(23 * 60 * 60);

        await ok(service, gameId, { type: 'end' });
        expect(await store.listActiveGameIds()).not.toContain(gameId);
        expect((await store.listFinishedGames()).map((s) => s.gameId)).toContain(gameId);
        expect(await redis.ttl(`game:${gameId}:state`)).toBeLessThanOrEqual(60 * 60);
    });
});
