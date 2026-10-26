import type { Clock } from '../../src/common/clock.js';

/**
 * Real time shifted by a test-controlled offset: `advance(ms)` jumps ahead (e.g. past a deadline) while
 * time keeps flowing, so BullMQ delayed jobs (which use real time) still fire.
 */
export class FakeClock implements Clock {
    private offset = 0;
    private frozenAt: number | null = null;

    now(): number {
        return this.frozenAt ?? Date.now() + this.offset;
    }

    advance(ms: number): void {
        if (this.frozenAt !== null) this.frozenAt += ms;
        else this.offset += ms;
    }

    /** Stops time (e.g. while an app restarts) until `unfreeze`, which carries on from the frozen moment. */
    freeze(): void {
        this.frozenAt = this.now();
    }

    unfreeze(): void {
        if (this.frozenAt === null) return;
        this.offset = this.frozenAt - Date.now();
        this.frozenAt = null;
    }
}

/** Time that stands still until the test moves it, so answer times (and therefore points) are exact. */
export class ManualClock implements Clock {
    private current = Date.now();

    now(): number {
        return this.current;
    }

    advance(ms: number): void {
        this.current += ms;
    }
}
