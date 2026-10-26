import { QUESTIONS_MIN, QUIZ_TITLE_MAX, type QuestionType } from '@quizpulse/protocol';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useStartGame } from '../../../api/games';
import { quizzesApi } from '../../../api/quizzes';
import { useI18n } from '../../../i18n/i18n';
import { Button } from '../../../ui/Button';
import { Spinner } from '../../../ui/Spinner';
import { newQuestion, toDraft, validate, type Draft, type DraftQuestion } from './draft';
import { readStash } from './draftStash';
import { QuestionEditor } from './QuestionEditor';
import { QuestionList } from './QuestionList';
import { SettingsPanel } from './SettingsPanel';
import { useAutosave } from './useAutosave';

/** Keyed by quiz id so that moving between quizzes starts from a clean state. */
export function EditorPage() {
    const { id = '' } = useParams();
    return <EditorBody key={id} id={id} />;
}

function EditorBody({ id }: { id: string }) {
    const { t } = useI18n();
    const { start, pending } = useStartGame();
    const [draft, setDraft] = useState<Draft | null>(null);
    const [failed, setFailed] = useState(false);
    const [selected, setSelected] = useState(0);
    /** The quiz as the server has it: what autosave counts as saved. */
    const [loaded, setLoaded] = useState<Draft | null>(null);

    useEffect(() => {
        let alive = true;
        quizzesApi.get(id).then(
            (q) => {
                if (!alive) return;
                const server = toDraft(q);
                setLoaded(server);
                // Edits refused while the session was gone come back as an unsaved draft, so autosave sends them.
                setDraft(readStash(id) ?? server);
            },
            () => {
                if (alive) setFailed(true);
            },
        );
        return () => {
            alive = false;
        };
    }, [id]);

    const errors = useMemo(() => (draft ? validate(draft) : {}), [draft]);
    const errorCount = Object.keys(errors).length;
    const { status, retry } = useAutosave(id, draft, errors, loaded);

    if (failed) return <p className="muted">{t.editor.loadFailed}</p>;
    if (!draft) return <Spinner label={t.common.loading} />;

    const index = Math.min(selected, draft.questions.length - 1);
    const current = draft.questions[index];
    const update = (p: Partial<Draft>) => {
        setDraft({ ...draft, ...p });
    };
    const replaceQuestion = (i: number, q: DraftQuestion) => {
        update({ questions: draft.questions.map((old, j) => (j === i ? q : old)) });
    };
    const add = (type: QuestionType) => {
        update({ questions: [...draft.questions, newQuestion(type)] });
        setSelected(draft.questions.length);
    };
    const remove = (i: number) => {
        update({ questions: draft.questions.filter((_, j) => j !== i) });
        setSelected(Math.max(0, i - 1));
    };

    return (
        <div className="editor">
            <header className="editor-head">
                <Link className="link" to="/studio">
                    {t.editor.back}
                </Link>
                <input
                    className={errors['title'] ? 'input editor-title invalid' : 'input editor-title'}
                    aria-label={t.editor.titleLabel}
                    aria-invalid={errors['title'] ? true : undefined}
                    maxLength={QUIZ_TITLE_MAX}
                    value={draft.title}
                    onChange={(e) => {
                        update({ title: e.target.value });
                    }}
                />
                <div className="editor-status" role="status">
                    {errorCount > 0 ? (
                        <span className="editor-status-bad">{t.editor.errorsCount(errorCount)}</span>
                    ) : status === 'failed' ? (
                        <>
                            <span className="editor-status-bad">{t.editor.failed}</span>
                            <span aria-hidden="true"> · </span>
                            <button type="button" className="link editor-retry" onClick={retry}>
                                {t.common.retry}
                            </button>
                        </>
                    ) : status === 'saved' ? (
                        <span>{t.editor.saved}</span>
                    ) : (
                        <span>{t.editor.saving}</span>
                    )}
                </div>
                <Button
                    variant="primary"
                    disabled={errorCount > 0 || status !== 'saved' || pending}
                    onClick={() => {
                        void start(id);
                    }}
                >
                    {t.studio.startGame}
                </Button>
            </header>
            <div className="editor-cols">
                <QuestionList
                    questions={draft.questions}
                    selected={index}
                    errors={errors}
                    onSelect={setSelected}
                    onAdd={add}
                />
                {current && (
                    <QuestionEditor
                        key={current.key}
                        question={current}
                        index={index}
                        errors={errors}
                        defaultTimeLimitSeconds={draft.settings.defaultTimeLimitSeconds}
                        canDelete={draft.questions.length > QUESTIONS_MIN}
                        onChange={(q) => {
                            replaceQuestion(index, q);
                        }}
                        onDelete={() => {
                            remove(index);
                        }}
                    />
                )}
                <SettingsPanel
                    settings={draft.settings}
                    errors={errors}
                    onChange={(settings) => {
                        update({ settings });
                    }}
                />
            </div>
        </div>
    );
}
