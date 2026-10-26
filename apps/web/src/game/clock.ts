import type { Countdown } from '@quizpulse/protocol';

/** How far the server clock is ahead of the local one (negative when the device clock runs ahead). */
export function clockOffset(serverNow: number, localNow: number): number {
    return serverNow - localNow;
}

/** Time left on a countdown by the server clock; a paused countdown (`closesAt` null) shows its frozen remainder. */
export function remainingMs(c: Countdown, offset: number, localNow: number): number {
    if (c.closesAt === null) return c.remainingMs;
    return Math.max(0, c.closesAt - (localNow + offset));
}

const offsets = new WeakMap<Countdown, number>();

/** The local clock. Kept behind a function so render code can read the time it displays. */
export function localNow(): number {
    return Date.now();
}

/**
 * The clock offset of one countdown snapshot, fixed the first time it is asked for. The game hooks ask as soon as
 * a view arrives, so a screen that mounts later still counts from the moment the snapshot was received.
 */
export function countdownOffset(c: Countdown): number {
    let offset = offsets.get(c);
    if (offset === undefined) {
        offset = clockOffset(c.serverNow, Date.now());
        offsets.set(c, offset);
    }
    return offset;
}

/** Fixes the offsets of a freshly received view's countdowns. */
export function stampCountdowns(...cs: (Countdown | null)[]): void {
    for (const c of cs) if (c !== null) countdownOffset(c);
}
