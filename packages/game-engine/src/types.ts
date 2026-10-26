import type { ErrorCode, GameOutcome, GamePhase, PlayerAnswer, QuestionType, QuizSettings } from '@quizpulse/protocol';

export interface QuestionSnapshot {
    index: number;
    type: QuestionType;
    text: string;
    imageId: string | null;
    options: string[];
    correctOption: number | null;
    numericAnswer: number | null;
    numericTolerance: number | null;
    /** Already resolved against the quiz default. */
    timeLimitSeconds: number;
    multiplier: 1 | 2 | 3;
}

export interface QuizSnapshot {
    quizId: string;
    title: string;
    settings: QuizSettings;
    questions: QuestionSnapshot[];
}

export interface SubmittedAnswer {
    playerId: string;
    answer: PlayerAnswer;
    activeMs: number;
}

export interface ScoredAnswer extends SubmittedAnswer {
    points: number;
    correct: boolean;
}

export type TimerKind = 'question_deadline' | 'auto_advance' | 'host_absent';

export interface PlayerState {
    id: string;
    nickname: string;
    joinedAt: number;
    connected: boolean;
    kicked: boolean;
    score: number;
    correctMs: number;
}

export interface QuestionRun {
    openedAt: number;
    pausedMs: number;
    closesAt: number | null;
    remainingMsAtPause: number | null;
}

export interface GameState {
    gameId: string;
    hostId: string;
    pin: string;
    joinUrl: string;
    quiz: QuizSnapshot;
    createdAt: number;
    phase: GamePhase;
    /** -1 in the lobby. */
    questionIndex: number;
    pause: { reason: 'host' | 'host_disconnected'; since: number } | null;
    question: QuestionRun | null;
    players: Record<string, PlayerState>;
    playerOrder: string[];
    /** points/correct stay 0/false until the question closes. */
    answers: Record<number, Record<string, ScoredAnswer>>;
    hostConnected: boolean;
    outcome: GameOutcome | null;
    /** When the pending `auto_advance` fires; null when none is scheduled or while paused. */
    advanceAt: number | null;
    /**
     * When the pending `host_absent` fires; null while the host is connected. States written before this field
     * existed lack it, so readers treat a missing value like null.
     */
    hostAbsentAt: number | null;
    timerEpoch: number;
    hostEpoch: number;
}

export type Command =
    | { type: 'player_join'; playerId: string; nickname: string }
    | { type: 'player_connection'; playerId: string; connected: boolean }
    | { type: 'host_connection'; connected: boolean }
    | { type: 'kick'; playerId: string }
    | { type: 'start' }
    | { type: 'next' }
    | { type: 'pause' }
    | { type: 'resume' }
    | { type: 'end' }
    | {
          type: 'answer';
          playerId: string;
          questionIndex: number;
          answer: PlayerAnswer;
          /**
           * Server time the answer arrived (before waiting for the game's lock). The deadline check and the answer
           * time use it; without it the processing time counts.
           */
          receivedAt?: number;
      }
    | { type: 'timer_fired'; timer: TimerKind; epoch: number };

export type Effect =
    | { type: 'schedule'; timer: TimerKind; epoch: number; at: number }
    | { type: 'persist_history' }
    /** Delete the game, free the PIN, broadcast game:closed. */
    | { type: 'close_lobby' }
    | { type: 'notify_kicked'; playerId: string };

export type ReduceResult = { ok: true; state: GameState; effects: Effect[] } | { ok: false; code: ErrorCode };
