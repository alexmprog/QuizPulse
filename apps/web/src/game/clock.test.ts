import { act, renderHook } from '@testing-library/react';
import type { Countdown } from '@quizpulse/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countdown } from '../test/fixtures';
import { clockOffset, remainingMs, stampCountdowns } from './clock';
import { useCountdown } from './useCountdown';

/** A fresh snapshot each time: offsets are fixed per snapshot object. */
const running = (): Countdown => ({ closesAt: 1_020_000, remainingMs: 20_000, serverNow: 1_000_000 });
const RUNNING = running();

describe('clock', () => {
    it('remainingMs uses server offset when phone clock is 5 min ahead', () => {
        const offset = clockOffset(1_000_000, 1_300_000);
        expect(offset).toBe(-300_000);
        expect(remainingMs(RUNNING, offset, 1_300_000)).toBe(20_000);
        expect(remainingMs(RUNNING, offset, 1_305_000)).toBe(15_000);
    });

    it('remainingMs never goes below zero', () => {
        expect(remainingMs(RUNNING, -300_000, 1_400_000)).toBe(0);
    });

    it('paused countdown shows remainingMs', () => {
        const paused = countdown(7_500, { paused: true });
        expect(remainingMs(paused, -300_000, 1_300_000)).toBe(7_500);
        expect(remainingMs(paused, 0, 9_999_999)).toBe(7_500);
    });
});

describe('useCountdown', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // The phone clock is 5 minutes ahead of the server.
        vi.setSystemTime(1_300_000);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns null without a countdown', () => {
        const { result } = renderHook(() => useCountdown(null, null));
        expect(result.current).toBeNull();
    });

    it('counts down by the server clock', () => {
        const c = running();
        const { result } = renderHook(() => useCountdown(c, null));
        expect(result.current).toEqual({ remainingMs: 20_000, seconds: 20, fraction: 1 });
        act(() => {
            vi.advanceTimersByTime(5_000);
        });
        expect(result.current).toEqual({ remainingMs: 15_000, seconds: 15, fraction: 0.75 });
        act(() => {
            vi.advanceTimersByTime(4_700);
        });
        expect(result.current?.seconds).toBe(11);
        act(() => {
            vi.advanceTimersByTime(60_000);
        });
        expect(result.current).toEqual({ remainingMs: 0, seconds: 0, fraction: 0 });
    });

    it('measures the fraction against totalMs when given', () => {
        const c = running();
        const { result } = renderHook(() => useCountdown(c, 40_000));
        expect(result.current?.fraction).toBe(0.5);
    });

    it('a new snapshot of the same countdown keeps the fraction base', () => {
        const { result, rerender } = renderHook((c: Countdown) => useCountdown(c, null), { initialProps: running() });
        act(() => {
            vi.advanceTimersByTime(10_000);
        });
        rerender({ closesAt: 1_020_000, remainingMs: 10_000, serverNow: 1_010_000 });
        expect(result.current).toEqual({ remainingMs: 10_000, seconds: 10, fraction: 0.5 });
    });

    it('counts from when the snapshot was received, not from when the screen mounted', () => {
        const c = running();
        stampCountdowns(c, null);
        vi.advanceTimersByTime(3_000);
        const { result } = renderHook(() => useCountdown(c, 20_000));
        expect(result.current).toEqual({ remainingMs: 17_000, seconds: 17, fraction: 0.85 });
    });

    it('paused countdown stays at remainingMs', () => {
        const { result } = renderHook(() => useCountdown(countdown(7_500, { paused: true }), null));
        act(() => {
            vi.advanceTimersByTime(5_000);
        });
        expect(result.current).toEqual({ remainingMs: 7_500, seconds: 8, fraction: 1 });
    });
});
