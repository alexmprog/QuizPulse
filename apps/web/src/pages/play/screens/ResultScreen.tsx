import type { PlayerView } from '@quizpulse/protocol';
import { formatNumber } from '../../../i18n/format';
import { useI18n } from '../../../i18n/i18n';
import { resultTone } from '../playerScreen';

/** The player's outcome of the closed question; the page background takes the same tone (`resultTone`). */
export function ResultScreen({ view }: { view: PlayerView }) {
    const { t, lang } = useI18n();
    const tone = resultTone(view);
    // A wrong numeric answer can still earn consolation points (the closest guess out of tolerance).
    const points = tone === 'neutral' ? 0 : (view.myResult?.points ?? 0);
    const line =
        tone === 'success'
            ? t.play.fastPoints
            : tone === 'danger'
              ? points > 0
                  ? t.play.consolation
                  : t.play.seeScreen
              : t.play.timeUpSub;
    return (
        <>
            <div className="play-center">
                <div className={`play-icon play-icon-lg play-result-icon-${tone}`}>
                    {tone === 'success' ? (
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={3}
                            strokeLinecap="round"
                            aria-hidden="true"
                        >
                            <path d="M5 12l5 5 9-10" />
                        </svg>
                    ) : tone === 'danger' ? (
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={3}
                            strokeLinecap="round"
                            aria-hidden="true"
                        >
                            <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                    ) : (
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            aria-hidden="true"
                        >
                            <circle cx="12" cy="13" r="8" />
                            <path d="M12 9v4l2.5 2M9 2h6" />
                        </svg>
                    )}
                </div>
                <h1 className={`display play-result-title play-result-title-${tone}`}>
                    {tone === 'success' ? t.play.correct : tone === 'danger' ? t.play.wrong : t.play.timeUp}
                </h1>
                <div className={tone === 'neutral' ? 'display tnum muted play-points' : 'display tnum play-points'}>
                    {t.play.plus(formatNumber(lang, points))}
                </div>
                <p className="muted play-text play-narrow">{line}</p>
            </div>
            <div className="card row-c play-total">
                <span className="muted">{t.play.total}</span>
                <span className="display tnum play-total-score">{formatNumber(lang, view.me.score)}</span>
            </div>
        </>
    );
}
