import type { QuestionSnapshot, ScoredAnswer, SubmittedAnswer } from './types.js';

const MAX_POINTS = 1000;
const MIN_SPEED_POINTS = 500;

function speedPoints(q: QuestionSnapshot, activeMs: number): number {
    const limitMs = q.timeLimitSeconds * 1000;
    const t = Math.min(Math.max(activeMs, 0), limitMs);
    return MAX_POINTS - (MIN_SPEED_POINTS * t) / limitMs;
}

function scoreOption(q: QuestionSnapshot, a: SubmittedAnswer): ScoredAnswer {
    if (a.answer.kind !== 'option' || q.correctOption === null || a.answer.option !== q.correctOption) {
        return { ...a, points: 0, correct: false };
    }
    return { ...a, points: Math.round(speedPoints(q, a.activeMs) * q.multiplier), correct: true };
}

function distance(q: QuestionSnapshot, a: SubmittedAnswer): number | null {
    if (a.answer.kind !== 'numeric' || q.numericAnswer === null) return null;
    return Math.abs(a.answer.value - q.numericAnswer);
}

function scoreNumeric(q: QuestionSnapshot, answers: SubmittedAnswer[]): ScoredAnswer[] {
    const tolerance = q.numericTolerance ?? 0;
    const distances = answers.map((a) => distance(q, a));
    const inTolerance = distances.some((d) => d !== null && d <= tolerance);
    const finite = distances.filter((d): d is number => d !== null && Number.isFinite(d));
    const closest = finite.length > 0 ? Math.min(...finite) : null;

    return answers.map((a, i) => {
        const d = distances[i];
        if (d === null || d === undefined) return { ...a, points: 0, correct: false };
        if (d <= tolerance) {
            const accuracy = tolerance === 0 ? 1 : 1 - (0.5 * d) / tolerance;
            return { ...a, points: Math.round(speedPoints(q, a.activeMs) * accuracy * q.multiplier), correct: true };
        }
        if (!inTolerance && d === closest) {
            return { ...a, points: MIN_SPEED_POINTS * q.multiplier, correct: false };
        }
        return { ...a, points: 0, correct: false };
    });
}

/** Pure scoring of all answers to one question. Output order matches input order. */
export function scoreQuestion(q: QuestionSnapshot, answers: SubmittedAnswer[]): ScoredAnswer[] {
    return q.type === 'numeric' ? scoreNumeric(q, answers) : answers.map((a) => scoreOption(q, a));
}
