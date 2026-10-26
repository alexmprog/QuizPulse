import type { LeaderboardEntry } from '@quizpulse/protocol';
import { formatNumber } from '../../../i18n/format';
import { useI18n } from '../../../i18n/i18n';

const TOP = 10;

/** Medal class for places 1–3, nothing below. */
export function medalClass(rank: number): string {
    return rank >= 1 && rank <= 3 ? `host-medal host-medal-${String(rank)}` : 'host-medal';
}

export function LeaderboardScreen({ entries }: { entries: LeaderboardEntry[] }) {
    const { t, lang } = useI18n();
    return (
        <div className="host-lb">
            <h2 className="display host-lb-title">{t.host.leaderboard}</h2>
            <ol className="host-lb-list">
                {entries.slice(0, TOP).map((e) => (
                    <li key={e.playerId} className={e.rank <= 3 ? 'row-c host-lb-row is-top' : 'row-c host-lb-row'}>
                        <span className={`display tnum ${medalClass(e.rank)}`}>{e.rank}</span>
                        <span className="host-lb-nick">{e.nickname}</span>
                        <span className="display tnum host-lb-score">{formatNumber(lang, e.score)}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}
