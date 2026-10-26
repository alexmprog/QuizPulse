import { expect } from 'vitest';
import { createGame, reduce } from '../src/index.js';
import type { Command, Effect, GameState, QuestionSnapshot, QuizSnapshot } from '../src/index.js';
import type { ErrorCode, QuizSettings } from '@quizpulse/protocol';

const q = (over: Partial<QuestionSnapshot>): QuestionSnapshot => ({
    index: 0,
    type: 'single_choice',
    text: 'Q',
    imageId: null,
    options: ['a', 'b', 'c', 'd'],
    correctOption: 1,
    numericAnswer: null,
    numericTolerance: null,
    timeLimitSeconds: 20,
    multiplier: 1,
    ...over,
});

export const defaultSettings: QuizSettings = {
    advanceMode: 'manual',
    autoAdvanceSeconds: 8,
    defaultTimeLimitSeconds: 20,
    earlyClose: false,
    leaderboardEvery: 2,
};

export function makeQuiz(settings: Partial<QuizSettings> = {}): QuizSnapshot {
    return {
        quizId: 'quiz-1',
        title: 'Fixture quiz',
        settings: { ...defaultSettings, ...settings },
        questions: [
            q({ index: 0 }),
            q({ index: 1, type: 'true_false', options: [], correctOption: 1 }),
            q({
                index: 2,
                type: 'numeric',
                options: [],
                correctOption: null,
                numericAnswer: 100,
                numericTolerance: 5,
            }),
        ],
    };
}

export function createdGame(settings: Partial<QuizSettings> = {}, now = 0): { state: GameState; effects: Effect[] } {
    return createGame({
        gameId: 'g1',
        hostId: 'h1',
        pin: '123456',
        joinUrl: 'http://x/play?pin=123456',
        quiz: makeQuiz(settings),
        now,
    });
}

/** A new game whose host has opened a socket. */
export function newGame(settings: Partial<QuizSettings> = {}, now = 0): GameState {
    return ok(createdGame(settings, now).state, { type: 'host_connection', connected: true }, now).state;
}

/** Applies a command that must succeed. */
export function ok(state: GameState, cmd: Command, now: number): { state: GameState; effects: Effect[] } {
    const r = reduce(state, cmd, now);
    if (!r.ok) throw new Error(`expected ok, got ${r.code} for ${cmd.type}`);
    return r;
}

export function expectCode(state: GameState, cmd: Command, now: number, code: ErrorCode): void {
    const r = reduce(state, cmd, now);
    expect(r).toEqual({ ok: false, code });
}

/** Lobby with the given players joined (ids = nicknames). */
export function lobbyWith(ids: string[], settings: Partial<QuizSettings> = {}): GameState {
    let s = newGame(settings);
    ids.forEach((id, i) => {
        s = ok(s, { type: 'player_join', playerId: id, nickname: id }, i + 1).state;
    });
    return s;
}

/** Started game with question 0 opened at `openedAt`. */
export function startedAt(ids: string[], openedAt: number, settings: Partial<QuizSettings> = {}): GameState {
    return ok(lobbyWith(ids, settings), { type: 'start' }, openedAt).state;
}
