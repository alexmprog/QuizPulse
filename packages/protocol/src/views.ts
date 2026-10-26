import type { AdvanceMode, PlayerAnswer, QuestionType } from './quiz.js';

export type GamePhase = 'lobby' | 'question_open' | 'question_results' | 'leaderboard' | 'finished';
export type GameOutcome = 'completed' | 'aborted';

export interface PauseView {
    reason: 'host' | 'host_disconnected';
}

export interface QuestionPublic {
    index: number;
    type: QuestionType;
    text: string;
    imageUrl: string | null;
    options: string[];
    timeLimitSeconds: number;
    multiplier: number;
}

export interface Countdown {
    closesAt: number | null;
    remainingMs: number;
    serverNow: number;
}

export interface QuestionResults {
    correctOption: number | null;
    numericAnswer: number | null;
    numericTolerance: number | null;
    /** For option questions. */
    optionCounts: number[] | null;
    /** Top 3 for numeric questions. */
    closestNumeric: { nickname: string; value: number }[] | null;
    noAnswerCount: number;
}

export interface LeaderboardEntry {
    playerId: string;
    nickname: string;
    score: number;
    rank: number;
}

export interface HostPlayerView {
    id: string;
    nickname: string;
    connected: boolean;
    score: number;
    answered: boolean;
}

export interface HostView {
    gameId: string;
    pin: string;
    joinUrl: string;
    phase: GamePhase;
    pause: PauseView | null;
    quizTitle: string;
    questionIndex: number;
    questionCount: number;
    question: QuestionPublic | null;
    countdown: Countdown | null;
    answeredCount: number;
    players: HostPlayerView[];
    results: QuestionResults | null;
    leaderboard: LeaderboardEntry[] | null;
    outcome: GameOutcome | null;
    advanceMode: AdvanceMode;
    /** Time until the automatic move on; null unless auto mode, results/leaderboard and not paused. */
    autoAdvance: Countdown | null;
}

export interface PlayerView {
    phase: GamePhase;
    pause: PauseView | null;
    quizTitle: string;
    questionIndex: number;
    questionCount: number;
    question: QuestionPublic | null;
    countdown: Countdown | null;
    me: { id: string; nickname: string; score: number; rank: number | null };
    answered: boolean;
    /** The player's own accepted answer to the visible question; never reveals correctness. */
    myAnswer: PlayerAnswer | null;
    /** Players who were not kicked. */
    playerCount: number;
    myResult: { correct: boolean; points: number } | null;
    /** Top 3 in `finished`. */
    podium: LeaderboardEntry[] | null;
    outcome: GameOutcome | null;
}
