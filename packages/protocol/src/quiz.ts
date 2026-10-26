export type QuestionType = 'single_choice' | 'true_false' | 'numeric';
export type AdvanceMode = 'manual' | 'auto';

export interface QuizSettings {
    advanceMode: AdvanceMode;
    autoAdvanceSeconds: number;
    defaultTimeLimitSeconds: number;
    earlyClose: boolean;
    leaderboardEvery: number;
}

export type PlayerAnswer = { kind: 'option'; option: number } | { kind: 'numeric'; value: number };
