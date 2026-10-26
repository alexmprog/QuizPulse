import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, type Schemas } from '../../api/client';
import { historyApi } from '../../api/history';
import { errorText } from '../../i18n/errors';
import { formatDate, formatNumber } from '../../i18n/format';
import { useI18n } from '../../i18n/i18n';
import { Badge } from '../../ui/Badge';
import { Spinner } from '../../ui/Spinner';

export function HistoryPage() {
    const { t, lang } = useI18n();
    const [games, setGames] = useState<Schemas['GameSummary'][] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        historyApi.list().then(
            (g) => {
                if (alive) setGames(g);
            },
            (e: unknown) => {
                if (alive) setError(errorText(t, e instanceof ApiError ? e.code : 'INTERNAL_ERROR'));
            },
        );
        return () => {
            alive = false;
        };
    }, [t]);

    return (
        <>
            <header className="studio-head">
                <h1 className="display">{t.studio.historyTitle}</h1>
            </header>
            {error && <p className="muted">{error}</p>}
            {!games && !error && <Spinner label={t.common.loading} />}
            {games?.length === 0 && (
                <section className="card quiz-card quiz-empty">
                    <p className="muted">{t.studio.historyEmpty}</p>
                    <div className="quiz-card-actions">
                        <Link className="btn btn-sm" to="/studio">
                            {t.studio.historyEmptyLink}
                        </Link>
                    </div>
                </section>
            )}
            {games && games.length > 0 && (
                <>
                    <div className="card tbl-wrap">
                        <table className="tbl tbl-cards">
                            <thead>
                                <tr>
                                    <th scope="col">{t.studio.colDate}</th>
                                    <th scope="col">{t.studio.colQuiz}</th>
                                    <th scope="col">{t.studio.colPlayers}</th>
                                    <th scope="col">{t.studio.colWinner}</th>
                                    <th scope="col">{t.studio.colStatus}</th>
                                    <th scope="col">
                                        <span className="sr-only">{t.studio.details}</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {games.map((g) => (
                                    <tr key={g.gameId}>
                                        <td data-col="date">{formatDate(lang, g.startedAt)}</td>
                                        <td className="tbl-title" data-col="quiz">
                                            {g.quizTitle}
                                        </td>
                                        <td data-col="players">
                                            <span className="tbl-sep" aria-hidden="true">
                                                {'· '}
                                            </span>
                                            {t.studio.playersCount(g.playerCount)}
                                        </td>
                                        <td data-col="winner">
                                            {g.winner ? (
                                                <span className="tbl-title">
                                                    {t.studio.winnerScore(
                                                        g.winner.nickname,
                                                        formatNumber(lang, g.winner.score),
                                                    )}
                                                </span>
                                            ) : (
                                                <span className="winner-none muted">—</span>
                                            )}
                                        </td>
                                        <td data-col="status">
                                            <Badge tone={g.status === 'completed' ? 'success' : 'warning'}>
                                                {g.status === 'completed'
                                                    ? t.studio.statusCompleted
                                                    : t.studio.statusAborted}
                                            </Badge>
                                        </td>
                                        <td data-col="details">
                                            <Link className="link" to={`/studio/history/${g.gameId}`}>
                                                {t.studio.details}
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="muted">{t.studio.historyNote}</p>
                </>
            )}
        </>
    );
}
