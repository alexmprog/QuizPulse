export interface Clock {
    /** Milliseconds since the Unix epoch. */
    now(): number;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => Date.now() };
