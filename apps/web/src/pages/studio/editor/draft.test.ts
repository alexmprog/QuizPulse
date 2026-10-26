import { QUIZ_TITLE_MAX, quizInputSchema } from '@quizpulse/protocol';
import { describe, expect, it } from 'vitest';
import { changeType, removeOption, toDraft, toInput, validate, type Draft } from './draft';
import { QUIZ } from './fixtures';

function at(d: Draft, i: number) {
    const q = d.questions[i];
    if (!q) throw new Error('no question');
    return q;
}

describe('draft', () => {
    it('toInput(toDraft(quiz)) equals the QuizInput part of the quiz', () => {
        const expected = {
            title: QUIZ.title,
            language: QUIZ.language,
            settings: QUIZ.settings,
            questions: QUIZ.questions.map((q) => ({
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
        expect(toInput(toDraft(QUIZ))).toEqual(expected);
    });

    it('toDraft uses the question id as key and derives imageUrl from imageId', () => {
        const d = toDraft(QUIZ);
        expect(d.questions[0]?.key).toBe(QUIZ.questions[0]?.id);
        expect(d.questions[0]?.imageUrl).toBe('/api/v1/images/img1');
        expect(d.questions[1]?.imageUrl).toBeNull();
    });

    it('validate is empty for a valid quiz', () => {
        expect(validate(toDraft(QUIZ))).toEqual({});
    });

    it('validate flags empty question text at questions.1.text', () => {
        const d = toDraft(QUIZ);
        d.questions[1] = { ...at(d, 1), text: '' };
        expect(validate(d)['questions.1.text']).toBe(true);
    });

    it('validate flags numeric without answer at questions.0.numericAnswer', () => {
        const d = toDraft(QUIZ);
        d.questions = [{ ...at(d, 2), numericAnswer: null }];
        expect(validate(d)['questions.0.numericAnswer']).toBe(true);
    });

    it('validate flags an empty option and a bad title', () => {
        const d = toDraft(QUIZ);
        d.title = '';
        d.questions[0] = { ...at(d, 0), options: ['Paris', ''] };
        const errors = validate(d);
        expect(errors['title']).toBe(true);
        expect(errors['questions.0.options.1']).toBe(true);
    });

    it('changeType to true_false clears options and passes schema', () => {
        const d = toDraft(QUIZ);
        const q = changeType(at(d, 0), 'true_false');
        expect(q.options).toEqual([]);
        expect(q.correctOption).toBe(0);
        expect(q.key).toBe(d.questions[0]?.key);
        expect(quizInputSchema.safeParse(toInput({ ...d, questions: [q] })).success).toBe(true);
    });

    it('changeType to numeric and back to single_choice gives the documented defaults', () => {
        const d = toDraft(QUIZ);
        const n = changeType(at(d, 0), 'numeric');
        expect(n).toMatchObject({ options: [], correctOption: null, numericAnswer: null, numericTolerance: 0 });
        const s = changeType(n, 'single_choice');
        expect(s).toMatchObject({ options: ['', ''], correctOption: 0 });
    });

    it('removing option before correct shifts correctOption', () => {
        const q = { ...at(toDraft(QUIZ), 0), options: ['a', 'b', 'c'], correctOption: 2 };
        expect(removeOption(q, 0)).toMatchObject({ options: ['b', 'c'], correctOption: 1 });
    });

    it('removing the correct option resets correctOption to 0; removing a later one keeps it', () => {
        const q = { ...at(toDraft(QUIZ), 0), options: ['a', 'b', 'c'], correctOption: 1 };
        expect(removeOption(q, 1).correctOption).toBe(0);
        expect(removeOption(q, 2).correctOption).toBe(1);
    });

    it('toInput trims title, question text and options', () => {
        const d = toDraft(QUIZ);
        d.title = '  Pub  ';
        d.questions[0] = { ...at(d, 0), text: ' Q? ', options: [' a ', 'b  ', '  c'] };
        const input = toInput(d);
        expect(input.title).toBe('Pub');
        expect(input.questions[0]).toMatchObject({ text: 'Q?', options: ['a', 'b', 'c'], multiplier: 2 });
        expect(d.title).toBe('  Pub  ');
    });

    it('whitespace-only question text is an error at questions.0.text', () => {
        const d = toDraft(QUIZ);
        d.questions[0] = { ...at(d, 0), text: '   ' };
        expect(validate(d)['questions.0.text']).toBe(true);
    });

    it('whitespace-only title and option are errors', () => {
        const d = toDraft(QUIZ);
        d.title = '  ';
        d.questions[0] = { ...at(d, 0), options: ['Paris', '  '] };
        const errors = validate(d);
        expect(errors['title']).toBe(true);
        expect(errors['questions.0.options.1']).toBe(true);
    });

    it('title of QUIZ_TITLE_MAX chars with surrounding spaces is valid', () => {
        const d = toDraft(QUIZ);
        d.title = ` ${'a'.repeat(QUIZ_TITLE_MAX)} `;
        expect(validate(d)).toEqual({});
    });
});
