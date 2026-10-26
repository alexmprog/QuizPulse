import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, type Schemas } from '../../api/client';
import { gameStats, historyApi } from '../../api/history';
import { errorText } from '../../i18n/errors';
import { formatDate, formatNumber } from '../../i18n/format';
import { useI18n, type Dict } from '../../i18n/i18n';
import { Badge } from '../../ui/Badge';
import { Spinner } from '../../ui/Spinner';

function typeLabel(t: Dict, type: Schemas['HistoryQuestion']['type']): string {
    if (type === 'single_choice') return t.studio.typeSingle;
    return type === 'true_false' ? t.studio.typeTrueFalse : t.studio.typeNumeric;
}

export function HistoryDetailPage() {
    const { t, lang } = useI18n();
    const { gameId = '' } = useParams();
    const [game, setGame] = useState<Schemas['GameDetail'] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        historyApi.get(gameId).then(
            (g) => {
                if (alive) setGame(g);
            },
            (e: unknown) => {
                if (alive) setError(errorText(t, e instanceof ApiError ? e.code : 'INTERNAL_ERROR'));
            },
        );
        return () => {
            alive = false;
        };
    }, [gameId, t]);

    const stats = game ? gameStats(game) : null;
    const minutes = game
        ? Math.max(1, Math.round((new Date(game.endedAt).getTime() - new Date(game.startedAt).getTime()) / 60000))
        : 0;

    return (
        <>
            <Link className="link" to="/studio/history">
                ← {t.studio.historyBack}
            </Link>
            {error && <p className="muted">{error}</p>}
            {!game && !error && <Spinner label={t.common.loading} />}
            {game && stats && (
                <>
                    <header className="studio-head">
                        <div>
                            <h1 className="display">{game.quizTitle}</h1>
                            <p className="muted">
                                {t.studio.gameMeta(formatDate(lang, game.startedAt), t.studio.durationMinutes(minutes))}
                            </p>
                        </div>
                        <Badge tone={game.status === 'completed' ? 'success' : 'warning'}>
                            {game.status === 'completed' ? t.studio.statusCompleted : t.studio.statusAborted}
                        </Badge>
                    </header>
                    {game.status === 'aborted' && (
                        <p className="notice notice-warning" role="status">
                            {t.studio.abortedBanner(stats.playedQuestions, game.questions.length)}
                        </p>
                    )}
                    <dl className="stat-row">
                        <div className="card stat">
                            <dt className="muted">{t.studio.statPlayers}</dt>
                            <dd className="display">{formatNumber(lang, stats.players)}</dd>
                        </div>
                        <div className="card stat">
                            <dt className="muted">{t.studio.statPlayedQuestions}</dt>
                            <dd className="display">{formatNumber(lang, stats.playedQuestions)}</dd>
                        </div>
                        <div className="card stat">
                            <dt className="muted">{t.studio.statCorrectShare}</dt>
                            <dd className="display">
                                {stats.correctShare === null ? '—' : `${String(Math.round(stats.correctShare * 100))}%`}
                            </dd>
                        </div>
                    </dl>
                    <h2 className="section-title">{t.studio.standingsTitle}</h2>
                    <div className="card tbl-wrap">
                        <table className="tbl tbl-narrow">
                            <thead>
                                <tr>
                                    <th scope="col">{t.studio.colPlace}</th>
                                    <th scope="col">{t.studio.colNickname}</th>
                                    <th scope="col">{t.studio.colScore}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...game.players]
                                    .sort((a, b) => a.finalRank - b.finalRank)
                                    .map((p) => (
                                        <tr key={p.playerId}>
                                            <td>{p.finalRank}</td>
                                            <td className="tbl-title">{p.nickname}</td>
                                            <td>{formatNumber(lang, p.finalScore)}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                    <h2 className="section-title">{t.studio.questionsTitle}</h2>
                    <div className="card tbl-wrap">
                        <table className="tbl tbl-wide">
                            <thead>
                                <tr>
                                    <th scope="col">{t.studio.colNumber}</th>
                                    <th scope="col">{t.studio.colQuestion}</th>
                                    <th scope="col">{t.studio.colType}</th>
                                    <th scope="col">
                                        <span className="sr-only">{t.editor.multiplier}</span>
                                    </th>
                                    <th scope="col">{t.studio.colResult}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {game.questions.map((q) => (
                                    <tr key={q.position}>
                                        <td>{q.position + 1}</td>
                                        <td className="tbl-title">{q.text}</td>
                                        <td>{typeLabel(t, q.type)}</td>
                                        <td>
                                            {q.multiplier > 1 && (
                                                <Badge tone="accent">{`x${String(q.multiplier)}`}</Badge>
                                            )}
                                        </td>
                                        <td>
                                            {t.studio.correctOf(
                                                q.answers.filter((a) => a.correct).length,
                                                q.answers.length,
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </>
    );
}
