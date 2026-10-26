import { describe, expect, it } from 'vitest';
import { HOST_ABSENT_MS } from '@quizpulse/protocol';
import type { Command } from '../src/index.js';
import { pendingTimers } from '../src/index.js';
import { createdGame, expectCode, lobbyWith, newGame, ok, startedAt } from './fixtures.js';

const ans = (playerId: string, option: number): Command => ({
    type: 'answer',
    playerId,
    questionIndex: 0,
    answer: { kind: 'option', option },
});

describe('pause / resume', () => {
    it('pause mid-question freezes remaining time', () => {
        const s0 = startedAt(['a'], 0);
        const p = ok(s0, { type: 'pause' }, 5000);
        expect(p.state.question).toMatchObject({ closesAt: null, remainingMsAtPause: 15000 });
        expect(p.state.pause).toEqual({ reason: 'host', since: 5000 });
        expect(p.state.timerEpoch).toBe(s0.timerEpoch + 1);
        const r = ok(p.state, { type: 'resume' }, 65000);
        expect(r.state.question).toMatchObject({ closesAt: 80000, pausedMs: 60000, remainingMsAtPause: null });
        expect(r.state.pause).toBeNull();
        expect(r.effects).toEqual([
            { type: 'schedule', timer: 'question_deadline', epoch: r.state.timerEpoch, at: 80000 },
        ]);
    });

    it('answer after resume excludes paused time from activeMs', () => {
        const p = ok(startedAt(['a'], 0), { type: 'pause' }, 5000).state;
        const r = ok(p, { type: 'resume' }, 65000).state;
        const s = ok(r, ans('a', 1), 66000).state;
        expect(s.answers[0]?.a?.activeMs).toBe(6000);
    });

    it('answer during pause → PAUSED; next during pause → PAUSED', () => {
        const p = ok(startedAt(['a'], 0), { type: 'pause' }, 5000).state;
        expectCode(p, ans('a', 1), 6000, 'PAUSED');
        const s0 = startedAt(['a'], 0);
        const res = ok(s0, { type: 'timer_fired', timer: 'question_deadline', epoch: s0.timerEpoch }, 20000).state;
        expectCode(ok(res, { type: 'pause' }, 21000).state, { type: 'next' }, 22000, 'PAUSED');
    });

    it('deadline timer from before pause is stale, also after resume', () => {
        const s0 = startedAt(['a'], 0);
        const p = ok(s0, { type: 'pause' }, 5000).state;
        const stale: Command = { type: 'timer_fired', timer: 'question_deadline', epoch: s0.timerEpoch };
        expect(ok(p, stale, 20000).state).toEqual(p);
        const r = ok(p, { type: 'resume' }, 6000).state;
        const after = ok(r, stale, 20000);
        expect(after.state.phase).toBe('question_open');
        expect(after.effects).toEqual([]);
    });

    it('valid-epoch deadline before closesAt is a no-op', () => {
        const s0 = startedAt(['a'], 0);
        const r = ok(s0, { type: 'timer_fired', timer: 'question_deadline', epoch: s0.timerEpoch }, 10000);
        expect(r.state.phase).toBe('question_open');
        expect(r.effects).toEqual([]);
    });

    it('pause in lobby → INVALID_PHASE; resume without pause → INVALID_PHASE; double pause → PAUSED', () => {
        expectCode(lobbyWith(['a']), { type: 'pause' }, 5, 'INVALID_PHASE');
        const s = startedAt(['a'], 0);
        expectCode(s, { type: 'resume' }, 5, 'INVALID_PHASE');
        expectCode(ok(s, { type: 'pause' }, 5).state, { type: 'pause' }, 6, 'PAUSED');
    });

    it('pause/resume in results reschedules auto_advance with a fresh epoch', () => {
        const s0 = startedAt(['a'], 0, { advanceMode: 'auto', autoAdvanceSeconds: 8 });
        const res = ok(s0, { type: 'timer_fired', timer: 'question_deadline', epoch: s0.timerEpoch }, 20000).state;
        const p = ok(res, { type: 'pause' }, 21000).state;
        expect(p.timerEpoch).toBe(res.timerEpoch + 1);
        const stale: Command = { type: 'timer_fired', timer: 'auto_advance', epoch: res.timerEpoch };
        expect(ok(p, stale, 28000).state.phase).toBe('question_results');
        const r = ok(p, { type: 'resume' }, 30000);
        expect(r.effects).toEqual([{ type: 'schedule', timer: 'auto_advance', epoch: r.state.timerEpoch, at: 38000 }]);
    });

    it('resume re-checks early close after a player disconnected during the pause', () => {
        const s0 = startedAt(['a', 'b'], 0, { earlyClose: true });
        const answered = ok(s0, ans('a', 1), 1000).state;
        const p = ok(answered, { type: 'pause' }, 2000).state;
        const gone = ok(p, { type: 'player_connection', playerId: 'b', connected: false }, 3000).state;
        expect(gone.phase).toBe('question_open');
        const r = ok(gone, { type: 'resume' }, 4000);
        expect(r.state.phase).toBe('question_results');
        expect(r.state.question).toBeNull();
    });

    it('resume in results with manual advance schedules nothing', () => {
        const s0 = startedAt(['a'], 0);
        const res = ok(s0, { type: 'timer_fired', timer: 'question_deadline', epoch: s0.timerEpoch }, 20000).state;
        const r = ok(ok(res, { type: 'pause' }, 21000).state, { type: 'resume' }, 30000);
        expect(r.effects).toEqual([]);
    });
});

describe('host connection', () => {
    it('host disconnect auto-pauses with reason host_disconnected and schedules host_absent', () => {
        const s0 = startedAt(['a'], 0);
        const r = ok(s0, { type: 'host_connection', connected: false }, 5000);
        expect(r.state.hostConnected).toBe(false);
        expect(r.state.pause).toEqual({ reason: 'host_disconnected', since: 5000 });
        expect(r.state.question).toMatchObject({ closesAt: null, remainingMsAtPause: 15000 });
        expect(r.effects).toEqual([
            { type: 'schedule', timer: 'host_absent', epoch: r.state.hostEpoch, at: 5000 + HOST_ABSENT_MS },
        ]);
        expect(HOST_ABSENT_MS).toBe(1800000);
    });

    it('disconnect while paused by the host keeps the pause but tells players the host is gone', () => {
        const p = ok(startedAt(['a'], 0), { type: 'pause' }, 5000).state;
        const d = ok(p, { type: 'host_connection', connected: false }, 6000);
        expect(d.state.pause).toEqual({ reason: 'host_disconnected', since: 5000 });
        expect(d.state.question).toEqual(p.question);
        expect(d.state.timerEpoch).toBe(p.timerEpoch);
        // The 30-minute absence window runs during the pause too.
        expect(d.effects).toEqual([
            { type: 'schedule', timer: 'host_absent', epoch: d.state.hostEpoch, at: 6000 + HOST_ABSENT_MS },
        ]);
        const back = ok(d.state, { type: 'host_connection', connected: true }, 7000).state;
        expect(back.pause).toEqual({ reason: 'host', since: 5000 });
        expect(back.hostAbsentAt).toBeNull();
    });

    it('host reconnect keeps pause with reason host and makes host_absent stale', () => {
        const d = ok(startedAt(['a'], 0), { type: 'host_connection', connected: false }, 5000);
        const staleEpoch = d.state.hostEpoch;
        const r = ok(d.state, { type: 'host_connection', connected: true }, 6000).state;
        expect(r.hostConnected).toBe(true);
        expect(r.pause).toEqual({ reason: 'host', since: 5000 });
        const fired = ok(r, { type: 'timer_fired', timer: 'host_absent', epoch: staleEpoch }, 5000 + HOST_ABSENT_MS);
        expect(fired.state).toEqual(r);
        expect(fired.effects).toEqual([]);
        // Host resumes explicitly.
        expect(ok(r, { type: 'resume' }, 7000).state.question?.closesAt).toBe(7000 + 15000);
    });

    it('host_absent fired finishes aborted with persist_history', () => {
        const d = ok(startedAt(['a'], 0), { type: 'host_connection', connected: false }, 5000).state;
        const r = ok(d, { type: 'timer_fired', timer: 'host_absent', epoch: d.hostEpoch }, 5000 + HOST_ABSENT_MS);
        expect(r.state).toMatchObject({ phase: 'finished', outcome: 'aborted', question: null });
        expect(r.effects).toEqual([{ type: 'persist_history' }]);
    });

    it('host_absent in lobby emits close_lobby', () => {
        const d = ok(lobbyWith(['a']), { type: 'host_connection', connected: false }, 5000);
        expect(d.state.pause).toBeNull();
        const r = ok(d.state, { type: 'timer_fired', timer: 'host_absent', epoch: d.state.hostEpoch }, 99999999);
        expect(r.effects).toEqual([{ type: 'close_lobby' }]);
    });

    it('pause by host, then host disconnects, then host_absent finishes aborted', () => {
        const p = ok(startedAt(['a'], 0), { type: 'pause' }, 5000).state;
        const d = ok(p, { type: 'host_connection', connected: false }, 6000).state;
        expect(d.pause).toEqual({ reason: 'host_disconnected', since: 5000 });
        const r = ok(d, { type: 'timer_fired', timer: 'host_absent', epoch: d.hostEpoch }, 6000 + HOST_ABSENT_MS);
        expect(r.state).toMatchObject({ phase: 'finished', outcome: 'aborted', pause: null, question: null });
        expect(r.effects).toEqual([{ type: 'persist_history' }]);
    });

    it('new game waits for the host: hostConnected false and host_absent scheduled', () => {
        const { state, effects } = createdGame({}, 1000);
        expect(state.hostConnected).toBe(false);
        expect(effects).toEqual([
            { type: 'schedule', timer: 'host_absent', epoch: state.hostEpoch, at: 1000 + HOST_ABSENT_MS },
        ]);
    });

    it('host who never connects: host_absent closes the lobby', () => {
        const { state, effects } = createdGame({}, 0);
        const [timer] = effects;
        if (timer?.type !== 'schedule') throw new Error('expected a schedule effect');
        const r = ok(state, { type: 'timer_fired', timer: 'host_absent', epoch: timer.epoch }, timer.at);
        expect(r.effects).toEqual([{ type: 'close_lobby' }]);
    });

    it("host's first connection is a transition and makes the creation host_absent stale", () => {
        const { state, effects } = createdGame({}, 0);
        const [timer] = effects;
        if (timer?.type !== 'schedule') throw new Error('expected a schedule effect');
        const joined = ok(state, { type: 'host_connection', connected: true }, 10);
        expect(joined.state.hostConnected).toBe(true);
        expect(joined.state.hostEpoch).toBe(state.hostEpoch + 1);
        const fired = ok(joined.state, { type: 'timer_fired', timer: 'host_absent', epoch: timer.epoch }, timer.at);
        expect(fired.effects).toEqual([]);
        expect(fired.state).toEqual(joined.state);
    });

    it('host disconnect in finished does nothing', () => {
        const e = ok(startedAt(['a'], 0), { type: 'end' }, 100).state;
        const r = ok(e, { type: 'host_connection', connected: false }, 200);
        expect(r.effects).toEqual([]);
        expect(r.state.phase).toBe('finished');
    });
});

describe('pendingTimers (re-derived after a restart)', () => {
    it('open question: the deadline at closesAt with the current epoch', () => {
        const s = startedAt(['a'], 1000);
        expect(pendingTimers(s, 5000)).toEqual([
            { type: 'schedule', timer: 'question_deadline', epoch: s.timerEpoch, at: 21000 },
        ]);
    });

    it('paused question: nothing but the host absence when the host is gone', () => {
        const paused = ok(startedAt(['a'], 0), { type: 'pause' }, 5000).state;
        expect(pendingTimers(paused, 6000)).toEqual([]);
        const gone = ok(paused, { type: 'host_connection', connected: false }, 7000).state;
        expect(pendingTimers(gone, 8000)).toEqual([
            { type: 'schedule', timer: 'host_absent', epoch: gone.hostEpoch, at: 7000 + HOST_ABSENT_MS },
        ]);
    });

    it('results in auto mode: auto_advance at advanceAt; manual mode: nothing', () => {
        const open = startedAt(['a'], 0, { advanceMode: 'auto', autoAdvanceSeconds: 8 });
        const results = ok(open, { type: 'timer_fired', timer: 'question_deadline', epoch: open.timerEpoch }, 20000);
        expect(pendingTimers(results.state, 21000)).toEqual([
            { type: 'schedule', timer: 'auto_advance', epoch: results.state.timerEpoch, at: 28000 },
        ]);
        const manual = startedAt(['a'], 0);
        const closed = ok(manual, { type: 'timer_fired', timer: 'question_deadline', epoch: manual.timerEpoch }, 20000);
        expect(pendingTimers(closed.state, 21000)).toEqual([]);
    });

    it('lobby without host: host_absent at the stored time, or now + 30 min for an older state', () => {
        const { state } = createdGame({}, 1000);
        expect(pendingTimers(state, 2000)).toEqual([
            { type: 'schedule', timer: 'host_absent', epoch: state.hostEpoch, at: 1000 + HOST_ABSENT_MS },
        ]);
        const legacy = { ...state } as Partial<typeof state>;
        delete legacy.hostAbsentAt;
        expect(pendingTimers(legacy as typeof state, 2000)).toEqual([
            { type: 'schedule', timer: 'host_absent', epoch: state.hostEpoch, at: 2000 + HOST_ABSENT_MS },
        ]);
        expect(pendingTimers(newGame(), 2000)).toEqual([]);
    });

    it('finished game: nothing', () => {
        const ended = ok(startedAt(['a'], 0), { type: 'end' }, 100).state;
        expect(pendingTimers(ended, 200)).toEqual([]);
    });
});
