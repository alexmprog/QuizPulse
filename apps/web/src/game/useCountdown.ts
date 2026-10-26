import type { Countdown } from '@quizpulse/protocol';
import { useEffect, useState } from 'react';
import { countdownOffset, localNow, remainingMs } from './clock';

export interface CountdownState {
    remainingMs: number;
    /** Whole seconds left, rounded up. */
    seconds: number;
    /** Share of the countdown still left, 1 → 0. */
    fraction: number;
}

export const COUNTDOWN_TICK_MS = 250;

/**
 * Live time left on a server countdown (`HostView.countdown`, `HostView.autoAdvance`, `PlayerView.countdown`).
 * It counts by the server clock: the offset is the one fixed when the snapshot was received (`countdownOffset`),
 * so a device clock that is off by minutes, or a screen mounted after the snapshot came in, does not matter.
 * Re-renders every 250 ms while running; a paused countdown (`closesAt` null) shows its frozen `remainingMs`.
 *
 * `totalMs` is the full length `fraction` is measured against: pass the question time limit
 * (`timeLimitSeconds * 1000`) so the bar survives pause/resume. `null` measures against the remainder of the first
 * snapshot of the current run (`closesAt`); later snapshots of that run keep the base, but a resumed run starts
 * again from 1 — fine for `autoAdvance`, which is null while paused.
 */
export function useCountdown(c: Countdown | null, totalMs: number | null): CountdownState | null {
    const [, setTick] = useState(0);
    const [base, setBase] = useState<{ closesAt: number | null; ms: number } | null>(null);

    const newRun = c !== null && (base === null || (c.closesAt !== null && c.closesAt !== base.closesAt));
    if (newRun) setBase({ closesAt: c.closesAt, ms: c.remainingMs });

    useEffect(() => {
        if (c === null || c.closesAt === null) return;
        const offset = countdownOffset(c);
        const id = setInterval(() => {
            setTick((t) => t + 1);
            if (remainingMs(c, offset, Date.now()) === 0) clearInterval(id);
        }, COUNTDOWN_TICK_MS);
        return () => {
            clearInterval(id);
        };
    }, [c]);

    if (c === null) return null;
    const ms = remainingMs(c, countdownOffset(c), localNow());
    const total = totalMs ?? (newRun || base === null ? c.remainingMs : base.ms);
    const fraction = total > 0 ? Math.min(1, Math.max(0, ms / total)) : 0;
    return { remainingMs: ms, seconds: Math.ceil(ms / 1000), fraction };
}
