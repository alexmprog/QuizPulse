import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket';
import { countdown, playerView, question } from '../test/fixtures';
import { ACK_TIMEOUT_MS } from './socket';
import { useCountdown } from './useCountdown';
import { loadSession, saveSession, type PlayerSession } from './playerSession';
import { usePlayerGame } from './usePlayerGame';

const OLD: PlayerSession = { pin: '111111', gameId: 'g-old', playerId: 'p-old', playerToken: 't-old' };

function setup(pinFromUrl: string | null = null) {
    const fake = new FakeSocket();
    const hook = renderHook(() => usePlayerGame(pinFromUrl, fake.factory));
    return { fake, ...hook };
}

async function flush(): Promise<void> {
    await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
    });
}

const OPEN = playerView({
    phase: 'question_open',
    questionIndex: 2,
    question: question({ index: 2 }),
    countdown: countdown(),
});

describe('usePlayerGame', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('stays connected without joining while there is no session', () => {
        const { fake, result } = setup('123456');
        expect(result.current.restoring).toBe(false);
        act(() => {
            fake.connect();
        });
        expect(result.current.conn).toBe('online');
        expect(fake.emitted).toEqual([]);
    });

    it('rejoins with the saved session on every connect', async () => {
        saveSession(OLD);
        const { fake, result } = setup(OLD.pin);
        expect(result.current.restoring).toBe(true);
        fake.reply('player:rejoin', { ok: true, playerId: OLD.playerId });
        act(() => {
            fake.connect();
        });
        await flush();
        expect(result.current.restoring).toBe(false);
        act(() => {
            fake.drop();
        });
        expect(result.current.conn).toBe('reconnecting');
        act(() => {
            fake.connect();
        });
        expect(fake.sent('player:rejoin').map((e) => e.payload)).toEqual([
            { gameId: OLD.gameId, playerToken: OLD.playerToken },
            { gameId: OLD.gameId, playerToken: OLD.playerToken },
        ]);
        expect(loadSession()).toEqual(OLD);
    });

    it('stale session with other pin is cleared without rejoin', () => {
        saveSession(OLD);
        const { fake, result } = setup('222222');
        expect(result.current.restoring).toBe(false);
        act(() => {
            fake.connect();
        });
        expect(fake.sent('player:rejoin')).toHaveLength(0);
        expect(loadSession()).toBeNull();
    });

    it('INVALID_TOKEN clears session', async () => {
        saveSession(OLD);
        const { fake, result } = setup(null);
        fake.reply('player:rejoin', { ok: false, code: 'INVALID_TOKEN' });
        act(() => {
            fake.connect();
        });
        await flush();
        expect(loadSession()).toBeNull();
        expect(result.current.restoring).toBe(false);
        expect(result.current.exit).toBeNull();
        expect(result.current.view).toBeNull();
    });

    it('GAME_NOT_FOUND on rejoin clears session', async () => {
        saveSession(OLD);
        const { fake, result } = setup(OLD.pin);
        fake.reply('player:rejoin', { ok: false, code: 'GAME_NOT_FOUND' });
        act(() => {
            fake.connect();
        });
        await flush();
        expect(loadSession()).toBeNull();
        expect(result.current.exit).toBeNull();
    });

    it('KICKED on rejoin shows kicked exit', async () => {
        saveSession(OLD);
        const { fake, result } = setup(OLD.pin);
        fake.reply('player:rejoin', { ok: false, code: 'KICKED' });
        act(() => {
            fake.connect();
        });
        await flush();
        expect(loadSession()).toBeNull();
        expect(result.current.exit).toBe('kicked');
        expect(result.current.restoring).toBe(false);
    });

    it('join saves session from ack', async () => {
        const { fake, result } = setup('123456');
        act(() => {
            fake.connect();
        });
        fake.reply('player:join', { ok: true, playerId: 'p1', playerToken: 'tok', gameId: 'g1' });
        let res: unknown;
        await act(async () => {
            res = await result.current.join('123456', 'Alice');
        });
        expect(res).toBeNull();
        expect(fake.sent('player:join').map((e) => e.payload)).toEqual([{ pin: '123456', nickname: 'Alice' }]);
        expect(loadSession()).toEqual({ pin: '123456', gameId: 'g1', playerId: 'p1', playerToken: 'tok' });
    });

    it('a refused join returns the code and saves nothing', async () => {
        const { fake, result } = setup();
        act(() => {
            fake.connect();
        });
        fake.reply('player:join', { ok: false, code: 'NICKNAME_TAKEN' });
        let res: unknown;
        await act(async () => {
            res = await result.current.join('123456', 'Alice');
        });
        expect(res).toBe('NICKNAME_TAKEN');
        expect(loadSession()).toBeNull();
    });

    it('join and lookup while disconnected resolve INTERNAL_ERROR without sending', async () => {
        const { fake, result } = setup();
        let join: unknown;
        let lookup: unknown;
        await act(async () => {
            join = await result.current.join('123456', 'Alice');
            lookup = await result.current.lookup('123456');
        });
        expect(join).toBe('INTERNAL_ERROR');
        expect(lookup).toBe('INTERNAL_ERROR');
        expect(fake.emitted).toEqual([]);
    });

    it('a successful join ack after the timeout still saves the session', async () => {
        vi.useFakeTimers();
        const { fake, result } = setup('123456');
        act(() => {
            fake.connect();
        });
        let pending: Promise<unknown> = Promise.resolve();
        act(() => {
            pending = result.current.join('123456', 'Alice');
        });
        await act(async () => {
            vi.advanceTimersByTime(ACK_TIMEOUT_MS);
            await pending;
        });
        await expect(pending).resolves.toBe('INTERNAL_ERROR');
        expect(loadSession()).toBeNull();
        act(() => {
            fake.respond('player:join', { ok: true, playerId: 'p1', playerToken: 'tok', gameId: 'g1' });
        });
        expect(loadSession()).toEqual({ pin: '123456', gameId: 'g1', playerId: 'p1', playerToken: 'tok' });
    });

    it('lookup returns the quiz title or the error code', async () => {
        const { fake, result } = setup();
        act(() => {
            fake.connect();
        });
        fake.reply('player:lookup', { ok: true, quizTitle: 'Pub quiz' });
        let res: unknown;
        await act(async () => {
            res = await result.current.lookup('123456');
        });
        expect(res).toEqual({ quizTitle: 'Pub quiz' });
        expect(fake.sent('player:lookup').map((e) => e.payload)).toEqual([{ pin: '123456' }]);
        fake.reply('player:lookup', { ok: false, code: 'GAME_ALREADY_STARTED' });
        await act(async () => {
            res = await result.current.lookup('123456');
        });
        expect(res).toBe('GAME_ALREADY_STARTED');
    });

    it('player:kicked clears session', () => {
        saveSession(OLD);
        const { fake, result } = setup(OLD.pin);
        act(() => {
            fake.connect();
            fake.serverEmit('player:state', playerView());
            fake.serverEmit('player:kicked');
        });
        expect(loadSession()).toBeNull();
        expect(result.current.exit).toBe('kicked');
    });

    it('game:closed sets closed exit', () => {
        saveSession(OLD);
        const { fake, result } = setup(OLD.pin);
        act(() => {
            fake.connect();
            fake.serverEmit('game:closed');
        });
        expect(loadSession()).toBeNull();
        expect(result.current.exit).toBe('closed');
    });

    it('a server-side disconnect reconnects with a fresh socket', () => {
        const { fake, result } = setup();
        act(() => {
            fake.connect();
            fake.serverEmit('player:kicked');
            fake.drop('io server disconnect');
        });
        expect(fake.connected).toBe(true);
        expect(result.current.conn).toBe('online');
        expect(fake.sent('player:rejoin')).toHaveLength(0);
    });

    it('leave clears the session, view and exit and starts a fresh connection', () => {
        saveSession(OLD);
        const { fake, result } = setup(OLD.pin);
        act(() => {
            fake.connect();
            fake.serverEmit('player:state', playerView({ phase: 'finished' }));
            fake.serverEmit('game:closed');
        });
        act(() => {
            result.current.leave();
        });
        expect(loadSession()).toBeNull();
        expect(result.current.view).toBeNull();
        expect(result.current.exit).toBeNull();
        expect(fake.disconnectCalls).toBe(1);
        expect(fake.connected).toBe(true);
        expect(fake.sent('player:rejoin')).toHaveLength(1);
    });

    it('second answer while first is in flight is not emitted', async () => {
        const { fake, result } = setup();
        act(() => {
            fake.connect();
            fake.serverEmit('player:state', OPEN);
        });
        let first: Promise<unknown> = Promise.resolve();
        let second: Promise<unknown> = Promise.resolve();
        act(() => {
            first = result.current.answer({ kind: 'option', option: 1 });
            second = result.current.answer({ kind: 'option', option: 2 });
        });
        expect(fake.sent('player:answer').map((e) => e.payload)).toEqual([
            { questionIndex: 2, answer: { kind: 'option', option: 1 } },
        ]);
        await expect(second).resolves.toBeNull();
        act(() => {
            fake.respond('player:answer', { ok: true });
        });
        await expect(first).resolves.toBeNull();
        await flush();
        act(() => {
            void result.current.answer({ kind: 'option', option: 3 });
        });
        expect(fake.sent('player:answer')).toHaveLength(2);
    });

    it('ALREADY_ANSWERED ack returns code and keeps view', async () => {
        const { fake, result } = setup();
        act(() => {
            fake.connect();
            fake.serverEmit('player:state', OPEN);
        });
        fake.reply('player:answer', { ok: false, code: 'ALREADY_ANSWERED' });
        let res: unknown;
        await act(async () => {
            res = await result.current.answer({ kind: 'numeric', value: 42 });
        });
        expect(res).toBe('ALREADY_ANSWERED');
        expect(result.current.view).toBe(OPEN);
        expect(result.current.exit).toBeNull();
    });

    it('disconnects the socket on unmount', () => {
        const { fake, unmount } = setup();
        act(() => {
            fake.connect();
        });
        unmount();
        expect(fake.disconnectCalls).toBe(1);
    });

    it('a session joined with a typed pin survives a reconnect despite another link pin', async () => {
        const { fake, result } = setup('111111');
        act(() => {
            fake.connect();
        });
        fake.reply('player:join', { ok: true, playerId: 'p1', playerToken: 'tok', gameId: 'g2' });
        await act(async () => {
            await result.current.join('222222', 'Alice');
        });
        act(() => {
            fake.drop();
            fake.connect();
        });
        expect(fake.sent('player:rejoin').map((e) => e.payload)).toEqual([{ gameId: 'g2', playerToken: 'tok' }]);
        expect(loadSession()?.pin).toBe('222222');
    });

    it('a transient rejoin failure is retried and restoring holds until it settles', async () => {
        vi.useFakeTimers();
        saveSession(OLD);
        const { fake, result } = setup(OLD.pin);
        act(() => {
            fake.connect();
        });
        act(() => {
            fake.respond('player:rejoin', { ok: false, code: 'INTERNAL_ERROR' });
        });
        await flush();
        expect(result.current.restoring).toBe(true);
        expect(loadSession()).toEqual(OLD);
        act(() => {
            vi.advanceTimersByTime(1_500);
        });
        expect(fake.sent('player:rejoin')).toHaveLength(2);
        act(() => {
            fake.respond('player:rejoin', { ok: true, playerId: OLD.playerId });
        });
        await flush();
        expect(result.current.restoring).toBe(false);
    });

    it('a late rejoin ack after leave is dropped', async () => {
        saveSession(OLD);
        const { fake, result } = setup(OLD.pin);
        act(() => {
            fake.connect();
        });
        act(() => {
            result.current.leave();
        });
        act(() => {
            fake.respond('player:rejoin', { ok: false, code: 'KICKED' });
        });
        await flush();
        expect(result.current.exit).toBeNull();
        expect(result.current.restoring).toBe(false);
    });

    it('only the latest rejoin ends restoring', async () => {
        saveSession(OLD);
        const { fake, result } = setup(OLD.pin);
        act(() => {
            fake.connect();
            fake.drop();
            fake.connect();
        });
        act(() => {
            fake.respond('player:rejoin', { ok: true, playerId: OLD.playerId });
        });
        await flush();
        expect(result.current.restoring).toBe(true);
        act(() => {
            fake.respond('player:rejoin', { ok: true, playerId: OLD.playerId });
        });
        await flush();
        expect(result.current.restoring).toBe(false);
    });

    it('answering is true while the answer ack is pending', async () => {
        const { fake, result } = setup();
        act(() => {
            fake.connect();
            fake.serverEmit('player:state', OPEN);
        });
        expect(result.current.answering).toBe(false);
        act(() => {
            void result.current.answer({ kind: 'option', option: 0 });
        });
        expect(result.current.answering).toBe(true);
        act(() => {
            fake.respond('player:answer', { ok: false, code: 'QUESTION_CLOSED' });
        });
        await flush();
        expect(result.current.answering).toBe(false);
    });

    it('an answer without a view or while disconnected is not sent', async () => {
        const { fake, result } = setup();
        act(() => {
            fake.connect();
        });
        let res: unknown;
        await act(async () => {
            res = await result.current.answer({ kind: 'option', option: 0 });
        });
        expect(res).toBe('INTERNAL_ERROR');
        act(() => {
            fake.serverEmit('player:state', OPEN);
            fake.drop();
        });
        await act(async () => {
            res = await result.current.answer({ kind: 'option', option: 0 });
        });
        expect(res).toBe('INTERNAL_ERROR');
        expect(fake.sent('player:answer')).toHaveLength(0);
    });

    it('a countdown mounted later counts from when the snapshot arrived', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_300_000);
        const { fake, result } = setup();
        act(() => {
            fake.connect();
            fake.serverEmit('player:state', playerView({ phase: 'question_open', countdown: countdown(20_000) }));
        });
        vi.advanceTimersByTime(3_000);
        const timer = renderHook(() => useCountdown(result.current.view?.countdown ?? null, 20_000));
        expect(timer.result.current?.remainingMs).toBe(17_000);
    });
});
