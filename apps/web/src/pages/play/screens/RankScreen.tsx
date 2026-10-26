import type { PlayerView } from '@quizpulse/protocol';
import { formatNumber } from '../../../i18n/format';
import { useI18n } from '../../../i18n/i18n';

/** The player's own place after a leaderboard; the top 10 is on the big screen. */
export function RankScreen({ view }: { view: PlayerView }) {
    const { t, lang } = useI18n();
    return (
        <>
            <div className="play-center play-rank">
                <div className="muted play-rank-label">{t.play.yourPlace}</div>
                <div className="display tnum play-rank-place">{view.me.rank ?? '—'}</div>
                <div className="muted play-rank-label">{t.play.ofPlayers(view.playerCount)}</div>
                <div className="card play-rank-score">
                    <span className="display tnum play-rank-points">{formatNumber(lang, view.me.score)}</span>{' '}
                    <span className="muted">{t.play.points(view.me.score)}</span>
                </div>
            </div>
            <p className="muted play-foot">{t.play.topOnScreen}</p>
        </>
    );
}
