import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { GameState, ReduceResult } from '@quizpulse/game-engine';
import { FINISHED_STATE_TTL_SECONDS, PIN_LENGTH, STATE_TTL_SECONDS } from '@quizpulse/protocol';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

const stateKey = (gameId: string) => `game:${gameId}:state`;
const tokensKey = (gameId: string) => `game:${gameId}:tokens`;
const pinKey = (pin: string) => `pin:${pin}`;
const hostKey = (hostId: string) => `host:${hostId}:active`;

const MAX_UPDATE_ATTEMPTS = 10;
const MAX_PIN_ATTEMPTS = 100;
const PIN_SPACE = 10 ** PIN_LENGTH;

/** Deletes KEYS[1] only while it still holds ARGV[1] (a newer game may own the key by now). */
const DELETE_IF_EQUALS = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

const ttlOf = (state: GameState): number =>
    state.phase === 'finished' ? FINISHED_STATE_TTL_SECONDS : STATE_TTL_SECONDS;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Live game state in Redis. The whole state is one JSON value; `update` is an optimistic
 * compare-and-set (WATCH/MULTI) so concurrent commands never lose each other's writes.
 */
@Injectable()
export class GameStore implements OnModuleDestroy {
    /** WATCH is per connection, so every concurrent `update` needs a connection of its own. */
    private readonly idle: Redis[] = [];
    private readonly all: Redis[] = [];

    constructor(@Inject(REDIS) private readonly redis: Redis) {}

    async onModuleDestroy(): Promise<void> {
        await Promise.all(this.all.map((c) => c.quit()));
    }

    /** Reserves a free 6-digit PIN for the game; retries on collision with another active game. */
    async allocatePin(gameId: string): Promise<string> {
        for (let attempt = 0; attempt < MAX_PIN_ATTEMPTS; attempt += 1) {
            const pin = String(randomInt(0, PIN_SPACE)).padStart(PIN_LENGTH, '0');
            const set = await this.redis.set(pinKey(pin), gameId, 'EX', STATE_TTL_SECONDS, 'NX');
            if (set === 'OK') return pin;
        }
        throw new Error('no free PIN found');
    }

    /** Frees the PIN; with `gameId`, only while that game still holds it. */
    async releasePin(pin: string, gameId?: string): Promise<void> {
        if (gameId === undefined) await this.redis.del(pinKey(pin));
        else await this.redis.eval(DELETE_IF_EQUALS, 1, pinKey(pin), gameId);
    }

    gameIdByPin(pin: string): Promise<string | null> {
        return this.redis.get(pinKey(pin));
    }

    activeGameOf(hostId: string): Promise<string | null> {
        return this.redis.get(hostKey(hostId));
    }

    /** Claims the host's single active-game slot; returns false when another game holds it. */
    async claimHost(hostId: string, gameId: string): Promise<boolean> {
        return (await this.redis.set(hostKey(hostId), gameId, 'EX', STATE_TTL_SECONDS, 'NX')) === 'OK';
    }

    /** Frees the host's slot if this game still holds it. */
    async releaseHost(hostId: string, gameId: string): Promise<void> {
        await this.redis.eval(DELETE_IF_EQUALS, 1, hostKey(hostId), gameId);
    }

    async create(state: GameState): Promise<void> {
        await this.redis.set(stateKey(state.gameId), JSON.stringify(state), 'EX', ttlOf(state), 'NX');
    }

    async get(gameId: string): Promise<GameState | null> {
        const raw = await this.redis.get(stateKey(gameId));
        return raw === null ? null : (JSON.parse(raw) as GameState);
    }

    /**
     * Runs `fn` on the current state and stores the result if nobody changed the state meanwhile; otherwise
     * re-reads and retries. A missing game yields `GAME_NOT_FOUND`; a rejected command writes nothing.
     */
    async update(gameId: string, fn: (s: GameState) => ReduceResult): Promise<ReduceResult> {
        const key = stateKey(gameId);
        const conn = this.acquire();
        try {
            for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
                await conn.watch(key);
                const raw = await conn.get(key);
                if (raw === null) {
                    await conn.unwatch();
                    return { ok: false, code: 'GAME_NOT_FOUND' };
                }
                const result = fn(JSON.parse(raw) as GameState);
                if (!result.ok) {
                    await conn.unwatch();
                    return result;
                }
                const { state } = result;
                const ttl = ttlOf(state);
                const tx = conn.multi().set(key, JSON.stringify(state), 'EX', ttl).expire(tokensKey(gameId), ttl);
                // A running game keeps its PIN and host slot alive as long as its state; a finished one releases them.
                if (state.phase !== 'finished') tx.expire(pinKey(state.pin), ttl).expire(hostKey(state.hostId), ttl);
                if ((await tx.exec()) !== null) return result;
                await sleep(randomInt(1, 5 * (attempt + 1)));
            }
        } catch (error) {
            // Never hand a connection back to the pool with a WATCH still armed.
            await conn.unwatch().catch(() => undefined);
            throw error;
        } finally {
            this.release(conn);
        }
        throw new Error(`game ${gameId}: update conflicted ${String(MAX_UPDATE_ATTEMPTS)} times`);
    }

    /** Removes the state, the player tokens, the PIN and the host's active-game slot. */
    async delete(gameId: string): Promise<void> {
        const state = await this.get(gameId);
        await this.redis.del(stateKey(gameId), tokensKey(gameId));
        if (!state) return;
        await this.releasePin(state.pin, gameId);
        await this.releaseHost(state.hostId, gameId);
    }

    /** Issues an opaque 32-byte token; only its SHA-256 is stored. */
    async issuePlayerToken(gameId: string, playerId: string): Promise<string> {
        const token = randomBytes(32).toString('base64url');
        await this.redis
            .multi()
            .hset(tokensKey(gameId), hashToken(token), playerId)
            .expire(tokensKey(gameId), STATE_TTL_SECONDS)
            .exec();
        return token;
    }

    playerIdByToken(gameId: string, token: string): Promise<string | null> {
        return this.redis.hget(tokensKey(gameId), hashToken(token));
    }

    /** Games whose state is still in Redis and that have not finished. */
    async listActiveGameIds(): Promise<string[]> {
        return (await this.scanStates()).filter((s) => s.phase !== 'finished').map((s) => s.gameId);
    }

    /** Finished games whose state has not expired yet (kept for `FINISHED_STATE_TTL_SECONDS`). */
    async listFinishedGames(): Promise<GameState[]> {
        return (await this.scanStates()).filter((s) => s.phase === 'finished');
    }

    private async scanStates(): Promise<GameState[]> {
        const keys: string[] = [];
        let cursor = '0';
        do {
            const [next, batch] = await this.redis.scan(cursor, 'MATCH', stateKey('*'), 'COUNT', 200);
            cursor = next;
            keys.push(...batch);
        } while (cursor !== '0');
        if (keys.length === 0) return [];
        const values = await this.redis.mget(...keys);
        return values.flatMap((raw) => (raw === null ? [] : [JSON.parse(raw) as GameState]));
    }

    private acquire(): Redis {
        const conn = this.idle.pop();
        if (conn) return conn;
        const created = this.redis.duplicate();
        this.all.push(created);
        return created;
    }

    private release(conn: Redis): void {
        this.idle.push(conn);
    }
}
