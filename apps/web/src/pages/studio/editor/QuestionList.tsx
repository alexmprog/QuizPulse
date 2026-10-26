import { QUESTIONS_MAX, type QuestionType } from '@quizpulse/protocol';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/i18n';
import { Button } from '../../../ui/Button';
import type { DraftQuestion, FieldErrors } from './draft';

interface QuestionListProps {
    questions: readonly DraftQuestion[];
    selected: number;
    errors: FieldErrors;
    onSelect: (index: number) => void;
    onAdd: (type: QuestionType) => void;
}

const TYPES: readonly QuestionType[] = ['single_choice', 'true_false', 'numeric'];

export function QuestionList({ questions, selected, errors, onSelect, onAdd }: QuestionListProps) {
    const { t } = useI18n();
    const [menu, setMenu] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const typeName: Record<QuestionType, string> = {
        single_choice: t.studio.typeSingle,
        true_false: t.studio.typeTrueFalse,
        numeric: t.studio.typeNumeric,
    };

    useEffect(() => {
        if (!menu) return;
        const onDown = (e: MouseEvent) => {
            if (e.target instanceof Node && !ref.current?.contains(e.target)) setMenu(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMenu(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [menu]);

    const hasError = (i: number) => Object.keys(errors).some((k) => k.startsWith(`questions.${String(i)}.`));
    return (
        <div className="card editor-list">
            <ol className="editor-qlist" aria-label={t.editor.questionsList}>
                {questions.map((q, i) => {
                    const meta = [
                        typeName[q.type],
                        q.timeLimitSeconds === null
                            ? t.editor.timeDefaultShort
                            : Number.isNaN(q.timeLimitSeconds)
                              ? t.editor.timeCustom
                              : t.editor.timeShort(q.timeLimitSeconds),
                        q.imageId !== null ? t.editor.pictureShort : null,
                        q.multiplier > 1 ? `x${String(q.multiplier)}` : null,
                    ]
                        .filter(Boolean)
                        .join(' · ');
                    return (
                        <li key={q.key}>
                            <button
                                type="button"
                                className={i === selected ? 'editor-qitem on' : 'editor-qitem'}
                                aria-current={i === selected ? 'true' : undefined}
                                onClick={() => {
                                    onSelect(i);
                                }}
                            >
                                <span className="editor-qnum">{i + 1}</span>
                                <span className="editor-qbody">
                                    <span className="editor-qtext">
                                        {q.text.trim() === '' ? t.editor.noText : q.text}
                                    </span>
                                    <span className="editor-qmeta">{meta}</span>
                                </span>
                                {hasError(i) && (
                                    <span className="editor-qerr" role="img" aria-label={t.editor.questionHasErrors} />
                                )}
                            </button>
                        </li>
                    );
                })}
            </ol>
            <div className="menu-wrap editor-add" ref={ref}>
                <Button
                    block
                    disabled={questions.length >= QUESTIONS_MAX}
                    aria-haspopup="menu"
                    aria-expanded={menu}
                    onClick={() => {
                        setMenu(!menu);
                    }}
                >
                    {t.editor.addQuestion}
                </Button>
                {menu && (
                    <div className="menu editor-add-menu" role="menu">
                        {TYPES.map((type) => (
                            <button
                                key={type}
                                type="button"
                                role="menuitem"
                                className="menu-item"
                                onClick={() => {
                                    setMenu(false);
                                    onAdd(type);
                                }}
                            >
                                {typeName[type]}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
