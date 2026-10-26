import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitUnauthenticated, onUnauthenticated } from '../api/client';
import { FakeSocket } from '../test/fakeSocket';
import { hostView } from '../test/fixtures';
import { useHostGame } from './useHostGame';

const GAME_ID = '77777777-7777-4777-8777-777777777771';

function setup() {
    const fake = new FakeSocket();
    const hook = renderHook(() => useHostGame(GAME_ID, fake.factory));
    return { fake, ...hook };
}

/** Lets resolved ack promises reach the hook. */
async function flush(): Promise<void> {
    await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
    });
}

describe('useHostGame', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('host hook sends host:join on every connect', () => {
        const { fake, result } = setup();
        expect(result.current.conn).toBe('connecting');
        act(() => {
            fake.connect();
        });
        expect(result.current.conn).toBe('online');
        act(() => {
            fake.drop();
        });
        expect(result.current.conn).toBe('reconnecting');
        act(() => {
            fake.connect();
        });
        expect(fake.sent('host:join').map((e) => e.payload)).toEqual([{ gameId: GAME_ID }, { gameId: GAME_ID }]);
        expect(result.current.conn).toBe('online');
    });

    it('keeps the latest host:state snapshot', () => {
        const { fake, result } = setup();
        act(() => {
            fake.connect();
            fake.serverEmit('host:state', hostView({ phase: 'lobby' }));
            fake.serverEmit('host:state', hostView({ phase: 'question_open' }));
        });
        expect(result.current.view?.phase).toBe('question_open');
    });

    it('host:join NOT_HOST sets fatal', async () => {
        const { fake, result } = setup();
        fake.reply('host:join', { ok: false, code: 'NOT_HOST' });
        act(() => {
            fake.connect();
        });
        await flush();
        expect(result.current.fatal).toBe('NOT_HOST');
        expect(fake.disconnectCalls).toBe(1);
    });

    it('host:join UNAUTHENTICATED tells the app the session is gone and stops', async () => {
        const gone = vi.fn();
        const off = onUnauthenticated(gone);
        const { fake, result } = setup();
        fake.reply('host:join', { ok: false, code: 'UNAUTHENTICATED' });
        act(() => {
            fake.connect();
        });
        await flush();
        off();
        expect(gone).toHaveBeenCalledTimes(1);
        expect(result.current.fatal).toBe('UNAUTHENTICATED');
        expect(fake.connected).toBe(false);
    });

    it('a passing host:join error is not fatal', async () => {
        const { fake, result } = setup();
        fake.reply('host:join', { ok: false, code: 'RATE_LIMITED' });
        act(() => {
            fake.connect();
        });
        await flush();
        expect(result.current.fatal).toBeNull();
    });

    it('game:closed sets the closed fatal state', () => {
        const { fake, result } = setup();
        act(() => {
            fake.connect();
            fake.serverEmit('game:closed');
        });
        expect(result.current.fatal).toBe('closed');
    });

    it('host command ignored while previous is pending', async () => {
        const { fake, result } = setup();
        act(() => {
            fake.connect();
        });
        let first: Promise<unknown> = Promise.resolve();
        let second: Promise<unknown> = Promise.resolve();
        act(() => {
            first = result.current.command('host:next');
        });
        expect(result.current.pending).toBe(true);
        act(() => {
            second = result.current.command('host:next');
            void result.current.kick('p1');
        });
        expect(fake.sent('host:next')).toHaveLength(1);
        expect(fake.sent('host:kick')).toHaveLength(0);
        await expect(second).resolves.toBeNull();

        act(() => {
            fake.respond('host:next', { ok: false, code: 'INVALID_PHASE' });
        });
        await expect(first).resolves.toBe('INVALID_PHASE');
        await flush();
        expect(result.current.pending).toBe(false);

        let kicked: Promise<unknown> = Promise.resolve();
        act(() => {
            kicked = result.current.kick('p1');
        });
        expect(fake.sent('host:kick').map((e) => e.payload)).toEqual([{ playerId: 'p1' }]);
        act(() => {
            fake.respond('host:kick', { ok: true });
        });
        await expect(kicked).resolves.toBeNull();
    });

    it('disconnects the socket on unmount', () => {
        const { fake, unmount } = setup();
        act(() => {
            fake.connect();
        });
        unmount();
        expect(fake.disconnectCalls).toBe(1);
    });

    it('disconnects the socket when the session is gone', () => {
        const { fake } = setup();
        act(() => {
            fake.connect();
        });
        act(() => {
            emitUnauthenticated();
        });
        expect(fake.disconnectCalls).toBe(1);
    });

    it('a transient host:join failure is retried after a backoff', async () => {
        vi.useFakeTimers();
        const { fake, result } = setup();
        act(() => {
            fake.connect();
        });
        act(() => {
            fake.respond('host:join', { ok: false, code: 'INTERNAL_ERROR' });
        });
        await flush();
        expect(fake.sent('host:join')).toHaveLength(1);
        act(() => {
            vi.advanceTimersByTime(1_500);
        });
        expect(fake.sent('host:join')).toHaveLength(2);
        act(() => {
            fake.respond('host:join', { ok: false, code: 'RATE_LIMITED' });
        });
        await flush();
        act(() => {
            vi.advanceTimersByTime(3_000);
        });
        expect(fake.sent('host:join')).toHaveLength(3);
        act(() => {
            fake.respond('host:join', { ok: true });
        });
        await flush();
        act(() => {
            vi.advanceTimersByTime(60_000);
        });
        expect(fake.sent('host:join')).toHaveLength(3);
        expect(result.current.fatal).toBeNull();
    });

    it('a retry pending from a lost connection is dropped', async () => {
        vi.useFakeTimers();
        const { fake } = setup();
        act(() => {
            fake.connect();
        });
        act(() => {
            fake.respond('host:join', { ok: false, code: 'INTERNAL_ERROR' });
        });
        await flush();
        act(() => {
            fake.drop();
            vi.advanceTimersByTime(10_000);
        });
        expect(fake.sent('host:join')).toHaveLength(1);
    });

    it('a command while disconnected is not sent', async () => {
        const { fake, result } = setup();
        act(() => {
            fake.connect();
            fake.drop();
        });
        let res: unknown;
        await act(async () => {
            res = await result.current.command('host:start');
        });
        expect(res).toBe('INTERNAL_ERROR');
        expect(fake.sent('host:start')).toHaveLength(0);
        expect(result.current.pending).toBe(false);
    });
});
