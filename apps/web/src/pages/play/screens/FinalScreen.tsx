import type { PlayerView } from '@quizpulse/protocol';
import { formatNumber } from '../../../i18n/format';
import { useI18n } from '../../../i18n/i18n';
import { Button } from '../../../ui/Button';

/** Medal class for places 1–3, the neutral one below. */
function medal(rank: number | null): string {
    return rank !== null && rank >= 1 && rank <= 3 ? `play-medal play-medal-${String(rank)}` : 'play-medal';
}

/**
 * The end of the game: the player's place in its medal colour, the score and the podium with the player marked.
 * «Enter a PIN» forgets the finished game (its session would otherwise restore this screen).
 */
export function FinalScreen({ view, onEnterPin }: { view: PlayerView; onEnterPin: () => void }) {
    const { t, lang } = useI18n();
    const rank = view.me.rank;
    const podium = view.podium ?? [];
    return (
        <div className="play-final">
            <div className="play-final-me">
                <h1 className="display play-title-sm">{t.play.over}</h1>
                <div className={`display play-place ${medal(rank)}`}>{rank ?? '—'}</div>
                <div className="play-place-label">{t.play.place}</div>
                <div className="display tnum play-final-score">{formatNumber(lang, view.me.score)}</div>
            </div>
            {podium.length > 0 && (
                <ol className="card play-podium" aria-label={t.play.podium}>
                    {podium.map((e) => (
                        <li
                            key={e.playerId}
                            className={
                                e.playerId === view.me.id ? 'row-c play-podium-row is-me' : 'row-c play-podium-row'
                            }
                        >
                            <span className={`display play-podium-rank ${medal(e.rank)}`}>{e.rank}</span>
                            <span className="play-podium-nick">{e.nickname}</span>
                            <span className="tnum play-podium-score">{formatNumber(lang, e.score)}</span>
                        </li>
                    ))}
                </ol>
            )}
            <Button variant="primary" size="lg" block className="play-final-exit" onClick={onEnterPin}>
                {t.play.enterPin}
            </Button>
        </div>
    );
}
