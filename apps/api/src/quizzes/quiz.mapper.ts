import type { components } from '@quizpulse/api-types';
import type { QuestionSnapshot, QuizSnapshot } from '@quizpulse/game-engine';
import type { QuestionType, QuizInput, QuizSettings } from '@quizpulse/protocol';
import type { questions, quizzes } from '../db/schema.js';

export type Quiz = components['schemas']['Quiz'];
export type QuizSummary = components['schemas']['QuizSummary'];
type Question = components['schemas']['Question'];

export type QuizRow = typeof quizzes.$inferSelect;
export type QuestionRow = typeof questions.$inferSelect;

export function toSettings(row: QuizRow): QuizSettings {
    return {
        advanceMode: row.advanceMode as QuizSettings['advanceMode'],
        autoAdvanceSeconds: row.autoAdvanceSeconds,
        defaultTimeLimitSeconds: row.defaultTimeLimitSeconds,
        earlyClose: row.earlyClose,
        leaderboardEvery: row.leaderboardEvery,
    };
}

export function toQuestion(row: QuestionRow): Question {
    return {
        id: row.id,
        position: row.position,
        type: row.type as QuestionType,
        text: row.text,
        imageId: row.imageId,
        timeLimitSeconds: row.timeLimitSeconds,
        multiplier: row.multiplier as 1 | 2 | 3,
        options: (row.options as string[] | null) ?? [],
        correctOption: row.correctOption,
        numericAnswer: row.numericAnswer,
        numericTolerance: row.numericTolerance,
    };
}

export function toQuiz(row: QuizRow, questionRows: QuestionRow[]): Quiz {
    return {
        id: row.id,
        title: row.title,
        language: row.language as Quiz['language'],
        settings: toSettings(row),
        questions: questionRows.map(toQuestion),
        isPack: row.ownerId === null,
        packKey: row.packKey,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

export function toSummary(row: QuizRow, questionCount: number): QuizSummary {
    return {
        id: row.id,
        title: row.title,
        language: row.language as QuizSummary['language'],
        questionCount,
        isPack: row.ownerId === null,
        updatedAt: row.updatedAt.toISOString(),
    };
}

/** Columns of a `quizzes` row that come from `QuizInput` (everything except owner and keys). */
export function toQuizColumns(input: QuizInput) {
    return {
        title: input.title,
        language: input.language,
        advanceMode: input.settings.advanceMode,
        autoAdvanceSeconds: input.settings.autoAdvanceSeconds,
        defaultTimeLimitSeconds: input.settings.defaultTimeLimitSeconds,
        earlyClose: input.settings.earlyClose,
        leaderboardEvery: input.settings.leaderboardEvery,
    };
}

export function toQuestionRows(quizId: string, input: QuizInput['questions']): (typeof questions.$inferInsert)[] {
    return input.map((q, position) => ({
        quizId,
        position,
        type: q.type,
        text: q.text,
        imageId: q.imageId,
        timeLimitSeconds: q.timeLimitSeconds,
        multiplier: q.multiplier,
        options: q.options,
        correctOption: q.correctOption,
        numericAnswer: q.numericAnswer,
        numericTolerance: q.numericTolerance,
    }));
}

/** Input shape of an existing quiz (used to copy a pack). */
export function toQuizInput(quiz: Quiz): QuizInput {
    return {
        title: quiz.title,
        language: quiz.language,
        settings: quiz.settings,
        questions: quiz.questions.map((q) => ({
            type: q.type,
            text: q.text,
            imageId: q.imageId,
            timeLimitSeconds: q.timeLimitSeconds,
            multiplier: q.multiplier,
            options: q.options,
            correctOption: q.correctOption,
            numericAnswer: q.numericAnswer,
            numericTolerance: q.numericTolerance,
        })),
    };
}

export function toSnapshot(row: QuizRow, questionRows: QuestionRow[]): QuizSnapshot {
    const settings = toSettings(row);
    return {
        quizId: row.id,
        title: row.title,
        settings,
        questions: questionRows.map((qr, index): QuestionSnapshot => ({
            index,
            type: qr.type as QuestionType,
            text: qr.text,
            imageId: qr.imageId,
            options: (qr.options as string[] | null) ?? [],
            correctOption: qr.correctOption,
            numericAnswer: qr.numericAnswer,
            numericTolerance: qr.numericTolerance,
            timeLimitSeconds: qr.timeLimitSeconds ?? settings.defaultTimeLimitSeconds,
            multiplier: qr.multiplier as 1 | 2 | 3,
        })),
    };
}
