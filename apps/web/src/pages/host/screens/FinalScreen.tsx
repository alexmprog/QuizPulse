import type { LeaderboardEntry } from '@quizpulse/protocol';
import type { CSSProperties } from 'react';
import { formatNumber } from '../../../i18n/format';
import { useI18n } from '../../../i18n/i18n';
import { medalClass } from './LeaderboardScreen';

/** Podium columns left to right: 2nd, 1st, 3rd (indexes into the standings). */
const PODIUM_ORDER = [1, 0, 2] as const;
/** Reveal order 3rd → 2nd → 1st, ~400 ms apart; CSS drops the delay under `prefers-reduced-motion`. */
const REVEAL_STEP_MS = 400;

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
    const { lang } = useI18n();
    return (
        <div className="host-podium">
            {PODIUM_ORDER.map((i) => {
                const e = entries[i];
                if (!e) return null;
                const place = i + 1;
                const delay = (2 - i) * REVEAL_STEP_MS;
                return (
                    <div
                        key={e.playerId}
                        className={`host-podium-place host-podium-${String(place)}`}
                        style={{ '--delay': `${String(delay)}ms` } as CSSProperties}
                    >
                        <span className={`host-podium-avatar ${medalClass(place)}`} aria-hidden="true">
                            {e.nickname.charAt(0).toUpperCase()}
                        </span>
                        <span className="host-podium-nick">{e.nickname}</span>
                        <span className="display tnum muted host-podium-score">{formatNumber(lang, e.score)}</span>
                        <div className="card host-podium-block">
                            <span className="display host-podium-rank">{e.rank}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function Standings({ entries }: { entries: LeaderboardEntry[] }) {
    const { lang } = useI18n();
    const rows = Math.max(1, Math.ceil(entries.length / 2));
    return (
        <ol className="host-standings" style={{ '--rows': String(rows) } as CSSProperties}>
            {entries.map((e) => (
                <li key={e.playerId} className="row-c host-standings-row">
                    <span className={`display tnum ${medalClass(e.rank)}`}>{e.rank}</span>
                    <span className="host-lb-nick">{e.nickname}</span>
                    <span className="display tnum host-lb-score">{formatNumber(lang, e.score)}</span>
                </li>
            ))}
        </ol>
    );
}

export function FinalScreen({
    entries,
    quizTitle,
    showTable,
}: {
    entries: LeaderboardEntry[];
    quizTitle: string;
    showTable: boolean;
}) {
    const { t } = useI18n();
    if (showTable) {
        return (
            <div className="host-final-table">
                <h2 className="display host-lb-title host-final-table-title">
                    {t.host.results} · {quizTitle}
                </h2>
                <Standings entries={entries} />
            </div>
        );
    }
    return (
        <div className="host-final">
            <h2 className="display host-final-title">{t.host.over}</h2>
            <div className="muted host-final-quiz">{quizTitle}</div>
            <Podium entries={entries} />
        </div>
    );
}
