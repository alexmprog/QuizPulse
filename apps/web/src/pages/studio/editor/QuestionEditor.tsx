import {
    CHOICE_OPTIONS_MAX,
    CHOICE_OPTIONS_MIN,
    MULTIPLIERS,
    OPTION_TEXT_MAX,
    QUESTION_TEXT_MAX,
    TIME_LIMIT_DEFAULT_SECONDS,
    TIME_LIMIT_MAX_SECONDS,
    TIME_LIMIT_MIN_SECONDS,
    type QuestionType,
} from '@quizpulse/protocol';
import { useId } from 'react';
import { useI18n } from '../../../i18n/i18n';
import { FALSE_SLOT, SLOT_SHAPES, TRUE_SLOT } from '../../../ui/AnswerSlot';
import { Button } from '../../../ui/Button';
import { Segmented } from '../../../ui/Segmented';
import { addOption, changeType, removeOption, type DraftQuestion, type FieldErrors } from './draft';
import { ImageField } from './ImageField';
import { NumberField } from './NumberField';

interface QuestionEditorProps {
    question: DraftQuestion;
    index: number;
    errors: FieldErrors;
    defaultTimeLimitSeconds: number;
    canDelete: boolean;
    onChange: (q: DraftQuestion) => void;
    onDelete: () => void;
}

const SLOT_CLASSES = ['opt-a', 'opt-b', 'opt-c', 'opt-d'] as const;
type Multiplier = (typeof MULTIPLIERS)[number];
type MultiplierKey = '1' | '2' | '3';
const MULTIPLIER_KEYS: Record<Multiplier, MultiplierKey> = { 1: '1', 2: '2', 3: '3' };

function SlotMark({ slot }: { slot: number }) {
    return (
        <span className={`editor-slot ${SLOT_CLASSES[slot] ?? 'opt-a'}`} aria-hidden="true">
            <span className={`shape ${SLOT_SHAPES[slot] ?? 'tri'}`} />
        </span>
    );
}

export function QuestionEditor({
    question: q,
    index,
    errors,
    defaultTimeLimitSeconds,
    canDelete,
    onChange,
    onDelete,
}: QuestionEditorProps) {
    const { t } = useI18n();
    const textId = useId();
    const bad = (path: string) => errors[`questions.${String(index)}.${path}`] === true;
    const patch = (p: Partial<DraftQuestion>) => {
        onChange({ ...q, ...p });
    };
    const validDefault =
        Number.isInteger(defaultTimeLimitSeconds) &&
        defaultTimeLimitSeconds >= TIME_LIMIT_MIN_SECONDS &&
        defaultTimeLimitSeconds <= TIME_LIMIT_MAX_SECONDS
            ? defaultTimeLimitSeconds
            : TIME_LIMIT_DEFAULT_SECONDS;
    const rangeHint = t.editor.rangeHint(TIME_LIMIT_MIN_SECONDS, TIME_LIMIT_MAX_SECONDS);
    const setOption = (i: number, text: string) => {
        patch({ options: q.options.map((o, j) => (j === i ? text : o)) });
    };

    return (
        <section className="card editor-question" aria-label={t.editor.questionTitle(index + 1)}>
            <div className="editor-qhead">
                <Segmented<QuestionType>
                    label={t.editor.typeLabel}
                    value={q.type}
                    options={[
                        { value: 'single_choice', label: t.studio.typeSingle },
                        { value: 'true_false', label: t.studio.typeTrueFalse },
                        { value: 'numeric', label: t.studio.typeNumeric },
                    ]}
                    onChange={(type) => {
                        onChange(changeType(q, type));
                    }}
                />
                <Button variant="danger-ghost" size="sm" disabled={!canDelete} onClick={onDelete}>
                    {t.editor.deleteQuestion}
                </Button>
            </div>

            <div className="field">
                <label className="label" htmlFor={textId}>
                    {t.editor.questionText}
                </label>
                <textarea
                    id={textId}
                    className={bad('text') ? 'input invalid' : 'input'}
                    rows={3}
                    value={q.text}
                    aria-invalid={bad('text') ? true : undefined}
                    maxLength={QUESTION_TEXT_MAX}
                    onChange={(e) => {
                        patch({ text: e.target.value });
                    }}
                />
                <span className="hint editor-counter">{t.editor.counter(q.text.length, QUESTION_TEXT_MAX)}</span>
            </div>

            <ImageField
                imageUrl={q.imageUrl}
                onChange={(img) => {
                    patch({ imageId: img?.imageId ?? null, imageUrl: img?.imageUrl ?? null });
                }}
            />

            {q.type === 'single_choice' && (
                <div className="editor-options" role="group" aria-label={t.editor.correctAnswerGroup}>
                    {q.options.map((option, i) => (
                        // Options have no identity of their own: the position is the identity, like `correctOption`.
                        <div className="editor-option" key={i}>
                            <SlotMark slot={i} />
                            <input
                                className={bad(`options.${String(i)}`) ? 'input invalid' : 'input'}
                                aria-label={t.editor.optionLabel(i + 1)}
                                placeholder={t.editor.optionPlaceholder}
                                aria-invalid={bad(`options.${String(i)}`) ? true : undefined}
                                maxLength={OPTION_TEXT_MAX}
                                value={option}
                                onChange={(e) => {
                                    setOption(i, e.target.value);
                                }}
                            />
                            <label className="editor-radio">
                                <input
                                    type="radio"
                                    name={`correct-${q.key}`}
                                    aria-label={t.editor.markCorrect(i + 1)}
                                    checked={q.correctOption === i}
                                    onChange={() => {
                                        patch({ correctOption: i });
                                    }}
                                />
                                <span aria-hidden="true">{t.editor.correctShort}</span>
                            </label>
                            <button
                                type="button"
                                className="icon-btn"
                                aria-label={t.editor.removeOption(i + 1)}
                                disabled={q.options.length <= CHOICE_OPTIONS_MIN}
                                onClick={() => {
                                    onChange(removeOption(q, i));
                                }}
                            >
                                <span aria-hidden="true">×</span>
                            </button>
                        </div>
                    ))}
                    <div>
                        <Button
                            size="sm"
                            disabled={q.options.length >= CHOICE_OPTIONS_MAX}
                            onClick={() => {
                                onChange(addOption(q));
                            }}
                        >
                            {t.editor.addOption(q.options.length, CHOICE_OPTIONS_MAX)}
                        </Button>
                    </div>
                </div>
            )}

            {q.type === 'true_false' && (
                <div className="editor-tf" role="group" aria-label={t.editor.correctAnswerGroup}>
                    {(
                        [
                            { value: 0, slot: TRUE_SLOT, label: t.studio.optionTrue },
                            { value: 1, slot: FALSE_SLOT, label: t.studio.optionFalse },
                        ] as const
                    ).map((tile) => (
                        <label key={tile.value} className={`editor-tf-tile ${SLOT_CLASSES[tile.slot]}`}>
                            <span className={`shape ${SLOT_SHAPES[tile.slot]}`} aria-hidden="true" />
                            <span className="editor-tf-label">{tile.label}</span>
                            <input
                                type="radio"
                                name={`correct-${q.key}`}
                                checked={q.correctOption === tile.value}
                                onChange={() => {
                                    patch({ correctOption: tile.value });
                                }}
                            />
                        </label>
                    ))}
                </div>
            )}

            {q.type === 'numeric' && (
                <div className="editor-numeric">
                    <NumberField
                        decimal
                        label={t.editor.numericAnswer}
                        value={q.numericAnswer}
                        error={bad('numericAnswer') ? t.editor.numericAnswerRequired : undefined}
                        onChange={(v) => {
                            patch({ numericAnswer: v });
                        }}
                    />
                    <NumberField
                        decimal
                        label={t.editor.numericTolerance}
                        value={q.numericTolerance}
                        error={
                            bad('numericTolerance')
                                ? q.numericTolerance === null
                                    ? t.editor.toleranceRequired
                                    : t.editor.toleranceInvalid
                                : undefined
                        }
                        onChange={(v) => {
                            patch({ numericTolerance: v });
                        }}
                    />
                    <p className="hint editor-numeric-rule">
                        {t.editor.numericRule(q.numericAnswer, q.numericTolerance)}
                    </p>
                </div>
            )}

            <div className="editor-row">
                <div className="field">
                    <span className="label">{t.editor.timeLabel}</span>
                    <Segmented<'default' | 'custom'>
                        label={t.editor.timeLabel}
                        value={q.timeLimitSeconds === null ? 'default' : 'custom'}
                        options={[
                            { value: 'default', label: t.editor.timeDefault },
                            { value: 'custom', label: t.editor.timeCustom },
                        ]}
                        onChange={(mode) => {
                            patch({ timeLimitSeconds: mode === 'default' ? null : validDefault });
                        }}
                    />
                </div>
                {q.timeLimitSeconds !== null && (
                    <NumberField
                        label={t.editor.seconds}
                        value={Number.isNaN(q.timeLimitSeconds) ? null : q.timeLimitSeconds}
                        hint={rangeHint}
                        error={bad('timeLimitSeconds') ? rangeHint : undefined}
                        onChange={(v) => {
                            // An emptied field is not a number: the schema flags it and nothing is saved.
                            patch({ timeLimitSeconds: v ?? Number.NaN });
                        }}
                    />
                )}
                <div className="field">
                    <span className="label">{t.editor.multiplier}</span>
                    <Segmented<MultiplierKey>
                        label={t.editor.multiplier}
                        value={MULTIPLIER_KEYS[q.multiplier]}
                        options={MULTIPLIERS.map((m) => ({ value: MULTIPLIER_KEYS[m], label: `x${String(m)}` }))}
                        onChange={(m) => {
                            patch({ multiplier: Number(m) as Multiplier });
                        }}
                    />
                </div>
            </div>
        </section>
    );
}
