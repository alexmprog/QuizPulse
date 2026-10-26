import type { QuizInput } from '@quizpulse/protocol';

type QuestionInput = QuizInput['questions'][number];

export function choiceQuestion(overrides: Partial<QuestionInput> = {}): QuestionInput {
    return {
        type: 'single_choice',
        text: 'Capital of France?',
        imageId: null,
        timeLimitSeconds: null,
        multiplier: 1,
        options: ['Paris', 'Rome', 'Berlin'],
        correctOption: 0,
        numericAnswer: null,
        numericTolerance: null,
        ...overrides,
    };
}

export function trueFalseQuestion(overrides: Partial<QuestionInput> = {}): QuestionInput {
    return {
        ...choiceQuestion(),
        type: 'true_false',
        text: 'The sun is a star.',
        options: [],
        correctOption: 0,
        ...overrides,
    };
}

export function numericQuestion(overrides: Partial<QuestionInput> = {}): QuestionInput {
    return {
        ...choiceQuestion(),
        type: 'numeric',
        text: 'How many legs does a spider have?',
        options: [],
        correctOption: null,
        numericAnswer: 8,
        numericTolerance: 0,
        timeLimitSeconds: 30,
        multiplier: 2,
        ...overrides,
    };
}

export function sampleQuiz(overrides: Partial<QuizInput> = {}): QuizInput {
    return {
        title: 'Sample quiz',
        language: 'en',
        settings: {
            advanceMode: 'manual',
            autoAdvanceSeconds: 8,
            defaultTimeLimitSeconds: 20,
            earlyClose: true,
            leaderboardEvery: 5,
        },
        questions: [choiceQuestion(), trueFalseQuestion(), numericQuestion()],
        ...overrides,
    };
}

/** A valid 1x1 PNG. */
export const PNG_BYTES = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);
