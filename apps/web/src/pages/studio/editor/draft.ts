import { CHOICE_OPTIONS_MIN, quizInputSchema, type QuestionType } from '@quizpulse/protocol';
import type { Schemas } from '../../../api/client';

type QuestionInput = Schemas['QuestionInput'];
type QuizInput = Schemas['QuizInput'];

/** A question as the editor holds it: a stable React key and the preview URL of its picture next to the API fields. */
export type DraftQuestion = QuestionInput & { key: string; imageUrl: string | null };

export interface Draft extends QuizInput {
    questions: DraftQuestion[];
}

/** Field paths with a problem, such as 'title', 'questions.2.text' or 'questions.0.options.1'. */
export type FieldErrors = Record<string, true>;

const imageUrl = (imageId: string | null) => (imageId === null ? null : `/api/v1/images/${imageId}`);

export function toDraft(q: Schemas['Quiz']): Draft {
    return {
        title: q.title,
        language: q.language,
        settings: { ...q.settings },
        questions: q.questions.map((question) => ({
            key: question.id,
            type: question.type,
            text: question.text,
            imageId: question.imageId,
            imageUrl: imageUrl(question.imageId),
            timeLimitSeconds: question.timeLimitSeconds,
            multiplier: question.multiplier,
            options: [...question.options],
            correctOption: question.correctOption,
            numericAnswer: question.numericAnswer,
            numericTolerance: question.numericTolerance,
        })),
    };
}

/** The API payload: title, question and option texts trimmed (the server trims too, and checks length on the raw text). */
export function toInput(d: Draft): Schemas['QuizInput'] {
    return {
        title: d.title.trim(),
        language: d.language,
        settings: d.settings,
        questions: d.questions.map((q) => ({
            type: q.type,
            text: q.text.trim(),
            imageId: q.imageId,
            timeLimitSeconds: q.timeLimitSeconds,
            multiplier: q.multiplier,
            options: q.options.map((o) => o.trim()),
            correctOption: q.correctOption,
            numericAnswer: q.numericAnswer,
            numericTolerance: q.numericTolerance,
        })),
    };
}

export function validate(d: Draft): FieldErrors {
    const result = quizInputSchema.safeParse(toInput(d));
    const errors: FieldErrors = {};
    if (!result.success) {
        for (const issue of result.error.issues) errors[issue.path.map(String).join('.')] = true;
    }
    return errors;
}

/** Fields that only make sense for one question type are reset to that type's defaults. */
export function changeType(q: DraftQuestion, type: QuestionType): DraftQuestion {
    if (type === q.type) return q;
    const common = { ...q, type };
    if (type === 'single_choice') {
        return { ...common, options: ['', ''], correctOption: 0, numericAnswer: null, numericTolerance: null };
    }
    if (type === 'true_false') {
        return { ...common, options: [], correctOption: 0, numericAnswer: null, numericTolerance: null };
    }
    return { ...common, options: [], correctOption: null, numericAnswer: null, numericTolerance: 0 };
}

let nextKey = 0;

/** A blank question of the given type with a key that cannot clash with server ids. */
export function newQuestion(type: QuestionType): DraftQuestion {
    nextKey += 1;
    return changeType(
        {
            key: `new-${String(nextKey)}`,
            type: 'numeric',
            text: '',
            imageId: null,
            imageUrl: null,
            timeLimitSeconds: null,
            multiplier: 1,
            options: [],
            correctOption: null,
            numericAnswer: null,
            numericTolerance: 0,
        },
        type,
    );
}

export function addOption(q: DraftQuestion): DraftQuestion {
    return { ...q, options: [...q.options, ''] };
}

/** Removing the marked option falls back to the first one; removing an earlier one shifts the index. */
export function removeOption(q: DraftQuestion, index: number): DraftQuestion {
    if (q.options.length <= CHOICE_OPTIONS_MIN) return q;
    const correct = q.correctOption;
    let next = correct;
    if (correct !== null) {
        if (index === correct) next = 0;
        else if (index < correct) next = correct - 1;
    }
    return { ...q, options: q.options.filter((_, i) => i !== index), correctOption: next };
}
