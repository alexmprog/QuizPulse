import type { Countdown, HostView, PlayerView, QuestionPublic } from '@quizpulse/protocol';

/** Server time of the fixture snapshots. */
export const SERVER_NOW = 1_000_000;

/**
 * A countdown snapshot taken at `serverNow`: running (closes `remainingMs` later) or, with `paused`, frozen
 * (`closesAt` null, `remainingMs` left).
 */
export function countdown(
    remainingMs = 20_000,
    { serverNow = SERVER_NOW, paused = false }: { serverNow?: number; paused?: boolean } = {},
): Countdown {
    return { closesAt: paused ? null : serverNow + remainingMs, remainingMs, serverNow };
}

export function question(overrides: Partial<QuestionPublic> = {}): QuestionPublic {
    return {
        index: 0,
        type: 'single_choice',
        text: 'Capital of France?',
        imageUrl: null,
        options: ['Paris', 'Rome', 'Oslo', 'Berlin'],
        timeLimitSeconds: 20,
        multiplier: 1,
        ...overrides,
    };
}

/** A host snapshot of a lobby with two players; override any field. */
export function hostView(overrides: Partial<HostView> = {}): HostView {
    return {
        gameId: '77777777-7777-4777-8777-777777777771',
        pin: '123456',
        joinUrl: 'http://localhost:5173/play?pin=123456',
        phase: 'lobby',
        pause: null,
        quizTitle: 'Pub quiz',
        questionIndex: 0,
        questionCount: 5,
        question: null,
        countdown: null,
        answeredCount: 0,
        players: [
            { id: 'p1', nickname: 'Alice', connected: true, score: 0, answered: false },
            { id: 'p2', nickname: 'Bob', connected: true, score: 0, answered: false },
        ],
        results: null,
        leaderboard: null,
        outcome: null,
        advanceMode: 'manual',
        autoAdvance: null,
        ...overrides,
    };
}

/** A player snapshot of a lobby (player `p1`, Alice, two players in the game); override any field. */
export function playerView(overrides: Partial<PlayerView> = {}): PlayerView {
    return {
        phase: 'lobby',
        pause: null,
        quizTitle: 'Pub quiz',
        questionIndex: 0,
        questionCount: 5,
        question: null,
        countdown: null,
        me: { id: 'p1', nickname: 'Alice', score: 0, rank: null },
        answered: false,
        myAnswer: null,
        playerCount: 2,
        myResult: null,
        podium: null,
        outcome: null,
        ...overrides,
    };
}
