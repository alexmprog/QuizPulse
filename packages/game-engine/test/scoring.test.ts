import { describe, expect, it } from 'vitest';
import { scoreQuestion } from '../src/index.js';
import type { QuestionSnapshot, SubmittedAnswer } from '../src/index.js';

const base: QuestionSnapshot = {
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
};
const numericQ = (over: Partial<QuestionSnapshot> = {}): QuestionSnapshot => ({
    ...base,
    type: 'numeric',
    options: [],
    correctOption: null,
    numericAnswer: 100,
    numericTolerance: 5,
    ...over,
});
const opt = (option: number, activeMs: number, playerId = 'p'): SubmittedAnswer => ({
    playerId,
    answer: { kind: 'option', option },
    activeMs,
});
const num = (value: number, activeMs: number, playerId = 'p'): SubmittedAnswer => ({
    playerId,
    answer: { kind: 'numeric', value },
    activeMs,
});

describe('scoreQuestion options', () => {
    it('instant correct option gives 1000', () => {
        expect(scoreQuestion(base, [opt(1, 0)])[0]).toMatchObject({ points: 1000, correct: true });
    });
    it('correct at deadline gives 500', () => {
        expect(scoreQuestion(base, [opt(1, 20000)])[0]?.points).toBe(500);
    });
    it('correct at half time gives 750', () => {
        expect(scoreQuestion(base, [opt(1, 10000)])[0]?.points).toBe(750);
    });
    it('multiplier 2 doubles', () => {
        expect(scoreQuestion({ ...base, multiplier: 2 }, [opt(1, 0)])[0]?.points).toBe(2000);
    });
    it('wrong option gives 0 and correct=false', () => {
        expect(scoreQuestion(base, [opt(0, 0)])[0]).toMatchObject({ points: 0, correct: false });
    });
    it('activeMs beyond T is clamped', () => {
        expect(scoreQuestion(base, [opt(1, 25000)])[0]?.points).toBe(500);
    });
    it('negative activeMs is clamped to 0', () => {
        expect(scoreQuestion(base, [opt(1, -5)])[0]?.points).toBe(1000);
    });
    it('answer of the wrong kind scores 0', () => {
        expect(scoreQuestion(base, [num(1, 0)])[0]).toMatchObject({ points: 0, correct: false });
    });
    it('preserves input order and fields', () => {
        const res = scoreQuestion(base, [opt(1, 0, 'a'), opt(0, 0, 'b')]);
        expect(res.map((r) => r.playerId)).toEqual(['a', 'b']);
    });
});

describe('scoreQuestion numeric', () => {
    it('numeric exact instant gives 1000', () => {
        expect(scoreQuestion(numericQ(), [num(100, 0)])[0]).toMatchObject({ points: 1000, correct: true });
    });
    it('numeric at tolerance edge instant gives 500', () => {
        expect(scoreQuestion(numericQ(), [num(105, 0)])[0]).toMatchObject({ points: 500, correct: true });
    });
    it('numeric tol 0 exact gives speed points', () => {
        const q = numericQ({ numericTolerance: 0 });
        expect(scoreQuestion(q, [num(100, 10000)])[0]).toMatchObject({ points: 750, correct: true });
    });
    it('numeric nobody in tolerance: closest get 500*multiplier, correct=false', () => {
        const q = numericQ({ numericTolerance: 1, multiplier: 3 });
        const res = scoreQuestion(q, [num(110, 0, 'a'), num(90, 0, 'b'), num(130, 0, 'c')]);
        expect(res.map((r) => r.points)).toEqual([1500, 1500, 0]);
        expect(res.every((r) => !r.correct)).toBe(true);
    });
    it('no closest bonus when someone is within tolerance', () => {
        const q = numericQ({ numericTolerance: 1 });
        const res = scoreQuestion(q, [num(100, 0, 'a'), num(110, 0, 'b')]);
        expect(res.map((r) => r.points)).toEqual([1000, 0]);
    });
    it('non-numeric answers are excluded from closest and score 0', () => {
        const q = numericQ({ numericTolerance: 1 });
        const res = scoreQuestion(q, [opt(0, 0, 'a'), num(110, 0, 'b')]);
        expect(res.map((r) => r.points)).toEqual([0, 500]);
    });
    it('empty answers give empty result', () => {
        expect(scoreQuestion(numericQ(), [])).toEqual([]);
    });
});
