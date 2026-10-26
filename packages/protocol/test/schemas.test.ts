import { describe, expect, it } from 'vitest';
import { CLIENT_EVENTS, clientEventSchemas, quizInputSchema } from '../src/index.js';

const settings = {
    advanceMode: 'manual',
    autoAdvanceSeconds: 8,
    defaultTimeLimitSeconds: 20,
    earlyClose: true,
    leaderboardEvery: 5,
};

const choice = {
    type: 'single_choice',
    text: 'Q?',
    imageId: null,
    timeLimitSeconds: null,
    multiplier: 1,
    options: ['a', 'b', 'c'],
    correctOption: 1,
    numericAnswer: null,
    numericTolerance: null,
};

const quiz = (q: object) => ({ title: 'T', language: 'en', settings, questions: [q] });

describe('clientEventSchemas', () => {
    it('player:join rejects nickname longer than 20 after trim', () => {
        const s = clientEventSchemas['player:join'];
        expect(s.safeParse({ pin: '123456', nickname: 'a'.repeat(21) }).success).toBe(false);
        expect(s.safeParse({ pin: '123456', nickname: `  ${'a'.repeat(20)}  ` }).success).toBe(true);
    });

    it('player:join rejects non-6-digit pin', () => {
        const s = clientEventSchemas['player:join'];
        expect(s.safeParse({ pin: '12345', nickname: 'a' }).success).toBe(false);
        expect(s.safeParse({ pin: 'abcdef', nickname: 'a' }).success).toBe(false);
    });

    it('player:answer rejects NaN and Infinity numeric value', () => {
        const s = clientEventSchemas['player:answer'];
        for (const value of [NaN, Infinity, -Infinity]) {
            expect(s.safeParse({ questionIndex: 0, answer: { kind: 'numeric', value } }).success).toBe(false);
        }
        expect(s.safeParse({ questionIndex: 0, answer: { kind: 'numeric', value: 4.2 } }).success).toBe(true);
    });

    it('CLIENT_EVENTS matches keys of clientEventSchemas', () => {
        expect(Object.keys(clientEventSchemas).sort()).toEqual([...CLIENT_EVENTS].sort());
    });
});

describe('quizInputSchema', () => {
    it('accepts a valid single_choice quiz', () => {
        expect(quizInputSchema.safeParse(quiz(choice)).success).toBe(true);
    });

    it('rejects single_choice with 5 options', () => {
        const q = { ...choice, options: ['a', 'b', 'c', 'd', 'e'] };
        expect(quizInputSchema.safeParse(quiz(q)).success).toBe(false);
    });

    it('rejects single_choice with correctOption out of range', () => {
        expect(quizInputSchema.safeParse(quiz({ ...choice, correctOption: 3 })).success).toBe(false);
    });

    it('rejects true_false with options and accepts empty options', () => {
        const tf = { ...choice, type: 'true_false', correctOption: 1 };
        expect(quizInputSchema.safeParse(quiz({ ...tf, options: ['a', 'b'] })).success).toBe(false);
        expect(quizInputSchema.safeParse(quiz({ ...tf, options: [] })).success).toBe(true);
        expect(quizInputSchema.safeParse(quiz({ ...tf, options: [], correctOption: 2 })).success).toBe(false);
    });

    it('numeric requires answer and non-negative tolerance', () => {
        const n = {
            ...choice,
            type: 'numeric',
            options: [],
            correctOption: null,
            numericAnswer: 10,
            numericTolerance: 0.5,
        };
        expect(quizInputSchema.safeParse(quiz(n)).success).toBe(true);
        expect(quizInputSchema.safeParse(quiz({ ...n, numericAnswer: null })).success).toBe(false);
        expect(quizInputSchema.safeParse(quiz({ ...n, numericTolerance: -1 })).success).toBe(false);
    });

    it('trims title, question text and options before the length checks', () => {
        const parsed = quizInputSchema.parse({
            ...quiz({ ...choice, text: '  Why?  ', options: [' a ', 'b\t', 'c', 'd'] }),
            title: '  Spaced  ',
        });
        expect(parsed.title).toBe('Spaced');
        expect(parsed.questions[0]?.text).toBe('Why?');
        expect(parsed.questions[0]?.options).toEqual(['a', 'b', 'c', 'd']);
        // Whitespace only is empty after trimming.
        expect(quizInputSchema.safeParse({ ...quiz(choice), title: '   ' }).success).toBe(false);
        expect(quizInputSchema.safeParse(quiz({ ...choice, text: ' \n ' })).success).toBe(false);
        expect(quizInputSchema.safeParse(quiz({ ...choice, options: ['a', '  ', 'c', 'd'] })).success).toBe(false);
    });

    it('rejects timeLimitSeconds 4 and 121, accepts null', () => {
        expect(quizInputSchema.safeParse(quiz({ ...choice, timeLimitSeconds: 4 })).success).toBe(false);
        expect(quizInputSchema.safeParse(quiz({ ...choice, timeLimitSeconds: 121 })).success).toBe(false);
        expect(quizInputSchema.safeParse(quiz({ ...choice, timeLimitSeconds: 5 })).success).toBe(true);
        expect(quizInputSchema.safeParse(quiz({ ...choice, timeLimitSeconds: null })).success).toBe(true);
    });
});
