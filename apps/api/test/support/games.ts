import { randomUUID } from 'node:crypto';
import type { Command, GameState, ReduceResult } from '@quizpulse/game-engine';
import type { QuizInput } from '@quizpulse/protocol';
import { expect } from 'vitest';
import type { Broadcaster, GameService } from '../../src/games/game.service.js';
import type { GameStore } from '../../src/games/game.store.js';
import type { TestClient } from './http-client.js';
import { registerHost } from './hosts.js';
import { sampleQuiz } from './quiz-fixtures.js';

export interface HostWithQuiz {
    client: TestClient;
    hostId: string;
    quizId: string;
}

/** Registers a host and creates one quiz for it through the REST API. */
export async function hostWithQuiz(baseUrl: string, quiz: QuizInput = sampleQuiz()): Promise<HostWithQuiz> {
    const client = await registerHost(baseUrl);
    const me = (await (await client.request('GET', '/api/v1/auth/me')).json()) as { id: string };
    const res = await client.request('POST', '/api/v1/quizzes', { body: quiz });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    return { client, hostId: me.id, quizId: id };
}

export async function ok(service: GameService, gameId: string, cmd: Command): Promise<GameState> {
    const result: ReduceResult = await service.execute(gameId, cmd);
    if (!result.ok) throw new Error(`${cmd.type} failed: ${result.code}`);
    return result.state;
}

/** Joins one player per nickname with a fresh uuid and returns their ids in join order. */
export async function joinPlayers(service: GameService, gameId: string, nicknames: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const nickname of nicknames) {
        const playerId = randomUUID();
        await ok(service, gameId, { type: 'player_join', playerId, nickname });
        ids.push(playerId);
    }
    return ids;
}

export async function current(store: GameStore, gameId: string): Promise<GameState> {
    const state = await store.get(gameId);
    if (!state) throw new Error(`game ${gameId} is gone`);
    return state;
}

export class RecordingBroadcaster implements Broadcaster {
    readonly published: GameState[] = [];
    readonly closedGames: string[] = [];
    readonly kickedPlayers: { gameId: string; playerId: string }[] = [];

    publish(state: GameState): void {
        this.published.push(state);
    }

    closed(gameId: string): void {
        this.closedGames.push(gameId);
    }

    kicked(gameId: string, playerId: string): void {
        this.kickedPlayers.push({ gameId, playerId });
    }
}

export async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (await check()) return;
        if (Date.now() > deadline) throw new Error(`condition not met within ${String(timeoutMs)} ms`);
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
