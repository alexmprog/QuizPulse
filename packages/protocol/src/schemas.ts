import { z, type ZodType } from 'zod';
import type { ClientToServerEvents } from './events.js';
import {
    AUTO_ADVANCE_MAX_SECONDS,
    AUTO_ADVANCE_MIN_SECONDS,
    CHOICE_OPTIONS_MAX,
    CHOICE_OPTIONS_MIN,
    LEADERBOARD_EVERY_MAX,
    LEADERBOARD_EVERY_MIN,
    NICKNAME_MAX,
    NICKNAME_MIN,
    OPTION_TEXT_MAX,
    OPTION_TEXT_MIN,
    PIN_LENGTH,
    QUESTION_TEXT_MAX,
    QUESTION_TEXT_MIN,
    QUESTIONS_MAX,
    QUESTIONS_MIN,
    QUIZ_TITLE_MAX,
    QUIZ_TITLE_MIN,
    TIME_LIMIT_MAX_SECONDS,
    TIME_LIMIT_MIN_SECONDS,
} from './limits.js';

const id = z.string().min(1).max(128);
const emptyPayload = z.object({});

/** Trim and collapse inner whitespace, then enforce length. */
export const nicknameSchema = z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(NICKNAME_MIN).max(NICKNAME_MAX));

export const pinSchema = z.string().regex(new RegExp(`^\\d{${String(PIN_LENGTH)}}$`));

export const playerAnswerSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('option'), option: z.number().int().min(0).max(3) }),
    z.object({ kind: z.literal('numeric'), value: z.number() }),
]);

export const clientEventSchemas = {
    'host:join': z.object({ gameId: id }),
    'host:start': emptyPayload,
    'host:next': emptyPayload,
    'host:pause': emptyPayload,
    'host:resume': emptyPayload,
    'host:kick': z.object({ playerId: id }),
    'host:end': emptyPayload,
    'player:lookup': z.object({ pin: pinSchema }),
    'player:join': z.object({ pin: pinSchema, nickname: nicknameSchema }),
    'player:rejoin': z.object({ gameId: id, playerToken: id }),
    'player:answer': z.object({
        questionIndex: z
            .number()
            .int()
            .min(0)
            .max(QUESTIONS_MAX - 1),
        answer: playerAnswerSchema,
    }),
} satisfies Record<keyof ClientToServerEvents, ZodType>;

export const quizSettingsSchema = z.object({
    advanceMode: z.enum(['manual', 'auto']),
    autoAdvanceSeconds: z.number().int().min(AUTO_ADVANCE_MIN_SECONDS).max(AUTO_ADVANCE_MAX_SECONDS),
    defaultTimeLimitSeconds: z.number().int().min(TIME_LIMIT_MIN_SECONDS).max(TIME_LIMIT_MAX_SECONDS),
    earlyClose: z.boolean(),
    leaderboardEvery: z.number().int().min(LEADERBOARD_EVERY_MIN).max(LEADERBOARD_EVERY_MAX),
});

/** Quiz texts are trimmed before the length checks, so whitespace only is rejected. */
const optionText = z.string().trim().min(OPTION_TEXT_MIN).max(OPTION_TEXT_MAX);

export const questionInputSchema = z
    .object({
        type: z.enum(['single_choice', 'true_false', 'numeric']),
        text: z.string().trim().min(QUESTION_TEXT_MIN).max(QUESTION_TEXT_MAX),
        imageId: z.string().min(1).nullable(),
        timeLimitSeconds: z.number().int().min(TIME_LIMIT_MIN_SECONDS).max(TIME_LIMIT_MAX_SECONDS).nullable(),
        multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        options: z.array(optionText).max(CHOICE_OPTIONS_MAX),
        correctOption: z.number().int().min(0).nullable(),
        numericAnswer: z.number().nullable(),
        numericTolerance: z.number().min(0).nullable(),
    })
    .superRefine((q, ctx) => {
        const fail = (path: string, message: string) => {
            ctx.addIssue({ code: 'custom', path: [path], message });
        };
        if (q.type === 'single_choice') {
            if (q.options.length < CHOICE_OPTIONS_MIN) fail('options', 'need 2-4 options');
            if (q.correctOption === null || q.correctOption >= q.options.length) {
                fail('correctOption', 'correctOption out of range');
            }
        } else if (q.type === 'true_false') {
            if (q.options.length !== 0) fail('options', 'true_false has no options');
            if (q.correctOption !== 0 && q.correctOption !== 1) {
                fail('correctOption', 'correctOption must be 0 or 1');
            }
        } else {
            if (q.options.length !== 0) fail('options', 'numeric has no options');
            if (q.numericAnswer === null) fail('numericAnswer', 'numericAnswer required');
            if (q.numericTolerance === null) fail('numericTolerance', 'numericTolerance required');
        }
    });

export const quizInputSchema = z.object({
    title: z.string().trim().min(QUIZ_TITLE_MIN).max(QUIZ_TITLE_MAX),
    language: z.enum(['ru', 'en']),
    settings: quizSettingsSchema,
    questions: z.array(questionInputSchema).min(QUESTIONS_MIN).max(QUESTIONS_MAX),
});

export type QuizInput = z.infer<typeof quizInputSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;
