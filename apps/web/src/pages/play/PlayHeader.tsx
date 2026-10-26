import type { Countdown, PlayerView } from '@quizpulse/protocol';
import type { ReactNode } from 'react';
import { useCountdown } from '../../game/useCountdown';
import { formatNumber } from '../../i18n/format';
import { useI18n } from '../../i18n/i18n';

function TimerBar({ countdown, totalMs }: { countdown: Countdown | null; totalMs: number }) {
    const { t } = useI18n();
    const left = useCountdown(countdown, totalMs);
    if (!left) return null;
    return (
        <div className="row-c play-timer">
            <div className="bar play-bar" aria-hidden="true">
                <i style={{ width: `${String(left.fraction * 100)}%` }} />
            </div>
            <span className="display tnum play-timer-sec" role="timer" aria-label={t.play.secondsLeft(left.seconds)}>
                {left.seconds}
            </span>
        </div>
    );
}

/**
 * The in-game top bar: «nickname · score», the «N / M» badge (or `badge` instead) and, with `timer`, the question
 * countdown bar with seconds.
 */
export function PlayHeader({
    view,
    score = true,
    timer = false,
    badge,
}: {
    view: PlayerView;
    score?: boolean;
    timer?: boolean;
    badge?: ReactNode;
}) {
    const { t, lang } = useI18n();
    const q = view.question;
    return (
        <header className="play-head">
            <div className="row-c play-head-row">
                <span className="play-head-me">
                    {view.me.nickname}
                    {score && (
                        <>
                            {' · '}
                            <span className="tnum">{formatNumber(lang, view.me.score)}</span>
                        </>
                    )}
                </span>
                <span className="row-c play-head-badges">
                    {badge ?? (
                        <>
                            {timer && q && q.multiplier > 1 && (
                                <span className="badge badge-accent">{t.host.multiplier(q.multiplier)}</span>
                            )}
                            <span className="badge tnum play-head-badge">
                                {t.play.questionOf(view.questionIndex + 1, view.questionCount)}
                            </span>
                        </>
                    )}
                </span>
            </div>
            {timer && q && <TimerBar countdown={view.countdown} totalMs={q.timeLimitSeconds * 1000} />}
        </header>
    );
}
