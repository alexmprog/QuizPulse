import type { Countdown } from '@quizpulse/protocol';
import type { CSSProperties } from 'react';
import { useCountdown } from '../../../game/useCountdown';
import { useI18n } from '../../../i18n/i18n';

/** The question timer: a `conic-gradient` ring with the seconds left, measured against the full time limit. */
export function TimerRing({
    countdown,
    totalMs,
    big,
}: {
    countdown: Countdown | null;
    totalMs: number;
    big?: boolean;
}) {
    const { t } = useI18n();
    const left = useCountdown(countdown, totalMs);
    const seconds = left?.seconds ?? Math.ceil(totalMs / 1000);
    const p = left ? left.fraction * 100 : 100;
    return (
        <div
            className={big ? 'ring host-ring host-ring-big' : 'ring host-ring'}
            style={{ '--p': String(p) } as CSSProperties}
            role="timer"
            aria-label={t.host.secondsLeft(seconds)}
        >
            <span className="display tnum" aria-hidden="true">
                {seconds}
            </span>
        </div>
    );
}
