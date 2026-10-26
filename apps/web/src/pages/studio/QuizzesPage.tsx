import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { gamesApi, newQuizInput, useStartGame } from '../../api/games';
import { ApiError, type Schemas } from '../../api/client';
import { quizzesApi } from '../../api/quizzes';
import { errorText } from '../../i18n/errors';
import { formatDate } from '../../i18n/format';
import { useI18n } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Spinner } from '../../ui/Spinner';
import { useToast } from '../../ui/Toast';

type Summary = Schemas['QuizSummary'];

function MoreMenu({ onDelete }: { onDelete: () => void }) {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (e.target instanceof Node && !ref.current?.contains(e.target)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className="menu-wrap" ref={ref}>
            <button
                type="button"
                className="icon-btn"
                aria-label={t.studio.more}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => {
                    setOpen(!open);
                }}
            >
                <span aria-hidden="true">⋯</span>
            </button>
            {open && (
                <div className="menu" role="menu">
                    <button
                        type="button"
                        role="menuitem"
                        className="menu-item menu-danger"
                        onClick={() => {
                            setOpen(false);
                            onDelete();
                        }}
                    >
                        {t.common.delete}
                    </button>
                </div>
            )}
        </div>
    );
}

export function QuizzesPage() {
    const { t, lang } = useI18n();
    const navigate = useNavigate();
    const notify = useToast();
    const { start, pending } = useStartGame();
    const [quizzes, setQuizzes] = useState<Summary[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [active, setActive] = useState<Schemas['GameCreated'] | null>(null);
    const [creating, setCreating] = useState(false);
    const [toDelete, setToDelete] = useState<Summary | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        let alive = true;
        quizzesApi.list().then(
            (q) => {
                if (alive) setQuizzes(q);
            },
            () => {
                if (alive) setFailed(true);
            },
        );
        gamesApi.active().then(
            (g) => {
                if (alive) setActive(g);
            },
            () => {
                /* the banner is a hint; without it the buttons stay usable and the server answers ACTIVE_GAME_EXISTS */
            },
        );
        return () => {
            alive = false;
        };
    }, []);

    const fail = useCallback(
        (e: unknown) => {
            notify(errorText(t, e instanceof ApiError ? e.code : 'INTERNAL_ERROR'));
        },
        [notify, t],
    );

    const create = () => {
        setCreating(true);
        quizzesApi.create(newQuizInput(t, lang)).then(
            (q) => {
                void navigate(`/studio/quizzes/${q.id}`);
            },
            (e: unknown) => {
                setCreating(false);
                fail(e);
            },
        );
    };

    const confirmDelete = () => {
        if (!toDelete) return;
        const target = toDelete;
        setDeleting(true);
        quizzesApi.remove(target.id).then(
            () => {
                setQuizzes((list) => list?.filter((q) => q.id !== target.id) ?? null);
                setToDelete(null);
                setDeleting(false);
            },
            (e: unknown) => {
                setDeleting(false);
                setToDelete(null);
                fail(e);
            },
        );
    };

    return (
        <>
            <header className="studio-head">
                <h1 className="display">{t.studio.quizzesTitle}</h1>
                <Button variant="primary" disabled={creating} onClick={create}>
                    {t.studio.createQuiz}
                </Button>
            </header>
            {active && (
                <div className="notice" role="status">
                    <span>{t.studio.activeGame(active.pin)}</span>
                    <Link className="link" to={`/host/${active.gameId}`}>
                        {t.studio.backToGame}
                    </Link>
                </div>
            )}
            {failed && <p className="muted">{t.studio.loadFailed}</p>}
            {!quizzes && !failed && <Spinner label={t.common.loading} />}
            {quizzes && (
                <div className="grid-cards">
                    {quizzes.map((q) => (
                        <article className="card quiz-card" key={q.id}>
                            <h2 className="quiz-card-title">{q.title}</h2>
                            <p className="muted quiz-card-meta">
                                {t.studio.quizMeta(
                                    t.studio.questionsCount(q.questionCount),
                                    formatDate(lang, q.updatedAt),
                                )}
                            </p>
                            <div className="quiz-card-actions">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    disabled={active !== null || pending}
                                    onClick={() => {
                                        void start(q.id);
                                    }}
                                >
                                    {t.studio.startGame}
                                </Button>
                                <Link className="btn btn-sm" to={`/studio/quizzes/${q.id}`}>
                                    {t.studio.edit}
                                </Link>
                                <MoreMenu
                                    onDelete={() => {
                                        setToDelete(q);
                                    }}
                                />
                            </div>
                        </article>
                    ))}
                    {quizzes.length === 0 && (
                        <section className="card quiz-card quiz-empty">
                            <h2 className="quiz-card-title">{t.studio.emptyTitle}</h2>
                            <p className="muted">{t.studio.emptyText}</p>
                            <div className="quiz-card-actions">
                                <Button variant="primary" size="sm" disabled={creating} onClick={create}>
                                    {t.studio.createQuiz}
                                </Button>
                                <Link className="btn btn-sm" to="/studio/packs">
                                    {t.studio.takePack}
                                </Link>
                            </div>
                        </section>
                    )}
                </div>
            )}
            {toDelete && (
                <Modal
                    title={t.studio.deleteTitle}
                    onClose={() => {
                        setToDelete(null);
                    }}
                    actions={
                        <>
                            <Button
                                onClick={() => {
                                    setToDelete(null);
                                }}
                            >
                                {t.common.cancel}
                            </Button>
                            <Button variant="danger" disabled={deleting} onClick={confirmDelete}>
                                {t.common.delete}
                            </Button>
                        </>
                    }
                >
                    <p>{t.studio.deleteText(toDelete.title)}</p>
                </Modal>
            )}
        </>
    );
}
