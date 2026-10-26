import { describe, expect, it } from 'vitest';
import type { Command, GameState } from '../src/index.js';
import { expectCode, lobbyWith, ok, startedAt } from './fixtures.js';

const ans = (playerId: string, option: number, questionIndex = 0): Command => ({
    type: 'answer',
    playerId,
    questionIndex,
    answer: { kind: 'option', option },
});

/** An answer to q0 that the gateway stamped as received at `receivedAt`. */
const ansAt = (playerId: string, option: number, receivedAt: number): Command => ({
    type: 'answer',
    playerId,
    questionIndex: 0,
    answer: { kind: 'option', option },
    receivedAt,
});

/** Close the current question via its deadline timer. */
function closeByDeadline(s: GameState): { state: GameState; effects: ReturnType<typeof ok>['effects'] } {
    const closesAt = s.question?.closesAt ?? 0;
    return ok(s, { type: 'timer_fired', timer: 'question_deadline', epoch: s.timerEpoch }, closesAt);
}

describe('question flow', () => {
    it('start opens q0 and schedules deadline at now+20000', () => {
        const lobby = lobbyWith(['a']);
        const r = ok(lobby, { type: 'start' }, 1000);
        expect(r.state.phase).toBe('question_open');
        expect(r.state.questionIndex).toBe(0);
        expect(r.state.question).toEqual({ openedAt: 1000, pausedMs: 0, closesAt: 21000, remainingMsAtPause: null });
        expect(r.state.timerEpoch).toBe(lobby.timerEpoch + 1);
        expect(r.effects).toEqual([
            { type: 'schedule', timer: 'question_deadline', epoch: r.state.timerEpoch, at: 21000 },
        ]);
    });

    it('answer records activeMs from openedAt', () => {
        const s = ok(startedAt(['a'], 1000), ans('a', 1), 6000).state;
        expect(s.answers[0]?.a).toMatchObject({ activeMs: 5000, points: 0, correct: false });
    });

    it('second answer → ALREADY_ANSWERED', () => {
        const s = ok(startedAt(['a'], 1000), ans('a', 1), 2000).state;
        expectCode(s, ans('a', 2), 3000, 'ALREADY_ANSWERED');
    });

    it('answer at now === closesAt → QUESTION_CLOSED', () => {
        const s = startedAt(['a'], 1000);
        expectCode(s, ans('a', 1), 21000, 'QUESTION_CLOSED');
        expectCode(s, ans('a', 1), 21001, 'QUESTION_CLOSED');
        ok(s, ans('a', 1), 20999);
    });

    it('answer received before closesAt but processed after it is accepted with activeMs from receipt', () => {
        const s = startedAt(['a'], 1000);
        const late = ok(s, ansAt('a', 1, 20999), 21050).state;
        expect(late.answers[0]?.a).toMatchObject({ activeMs: 19999 });
        const queued = ok(s, ansAt('a', 1, 6000), 6300).state;
        expect(queued.answers[0]?.a).toMatchObject({ activeMs: 5000 });
        expectCode(s, ansAt('a', 1, 21000), 21050, 'QUESTION_CLOSED');
        // A receipt time cannot lie in the future of processing.
        expect(ok(s, ansAt('a', 1, 9000), 6000).state.answers[0]?.a).toMatchObject({ activeMs: 5000 });
    });

    it('late answer gets QUESTION_CLOSED whether or not the deadline timer already fired', () => {
        const s = startedAt(['a'], 1000);
        expectCode(s, ans('a', 1), 21000, 'QUESTION_CLOSED');
        const results = closeByDeadline(s).state;
        expect(results.phase).toBe('question_results');
        expectCode(results, ans('a', 1), 21010, 'QUESTION_CLOSED');
        const paused = ok(results, { type: 'pause' }, 21020).state;
        expectCode(paused, ans('a', 1), 21030, 'QUESTION_CLOSED');
        const board = ok(
            closeByDeadline(startedAt(['a'], 1000, { leaderboardEvery: 1 })).state,
            { type: 'next' },
            21100,
        );
        expect(board.state.phase).toBe('leaderboard');
        expectCode(board.state, ans('a', 1), 21200, 'QUESTION_CLOSED');
        // A question that has not been opened yet is a phase error, not a closed question.
        expectCode(results, ans('a', 1, 1), 21010, 'INVALID_PHASE');
    });

    it('answer for previous questionIndex → QUESTION_CLOSED', () => {
        let s = startedAt(['a'], 0);
        s = closeByDeadline(s).state;
        s = ok(s, { type: 'next' }, 21000).state; // q1 (leaderboardEvery=2: after q0 no leaderboard)
        expect(s.questionIndex).toBe(1);
        expectCode(s, ans('a', 1, 0), 22000, 'QUESTION_CLOSED');
    });

    it('numeric answer to single_choice → INVALID_PAYLOAD', () => {
        const s = startedAt(['a'], 0);
        expectCode(
            s,
            { type: 'answer', playerId: 'a', questionIndex: 0, answer: { kind: 'numeric', value: 3 } },
            100,
            'INVALID_PAYLOAD',
        );
    });

    it('option out of range → INVALID_PAYLOAD', () => {
        const s = startedAt(['a'], 0);
        expectCode(s, ans('a', 4), 100, 'INVALID_PAYLOAD');
    });

    it('unknown player → INVALID_PAYLOAD, kicked player → KICKED', () => {
        const lobby = ok(lobbyWith(['a', 'b']), { type: 'kick', playerId: 'b' }, 5).state;
        const s = ok(lobby, { type: 'start' }, 10).state;
        expectCode(s, ans('ghost', 1), 11, 'INVALID_PAYLOAD');
        expectCode(s, ans('b', 1), 11, 'KICKED');
    });

    it('answer outside question_open → INVALID_PHASE; during pause → PAUSED', () => {
        expectCode(lobbyWith(['a']), ans('a', 1), 5, 'INVALID_PHASE');
        const s = startedAt(['a'], 0);
        const paused = ok(s, { type: 'pause' }, 5).state;
        expectCode(paused, ans('a', 1), 6, 'PAUSED');
    });

    it('deadline timer closes and scores', () => {
        const s = ok(startedAt(['a', 'b'], 0), ans('a', 1), 0).state;
        const r = closeByDeadline(s);
        expect(r.state.phase).toBe('question_results');
        expect(r.state.players.a).toMatchObject({ score: 1000, correctMs: 0 });
        expect(r.state.players.b).toMatchObject({ score: 0, correctMs: 0 });
        expect(r.state.answers[0]?.a).toMatchObject({ points: 1000, correct: true });
        expect(r.state.timerEpoch).toBe(s.timerEpoch + 1);
        expect(r.effects).toEqual([]); // manual mode
    });

    it('correctMs accumulates only for correct answers', () => {
        let s = ok(startedAt(['a', 'b'], 0), ans('a', 1), 4000).state;
        s = ok(s, ans('b', 0), 5000).state;
        s = closeByDeadline(s).state;
        expect(s.players.a).toMatchObject({ correctMs: 4000 });
        expect(s.players.b).toMatchObject({ correctMs: 0, score: 0 });
    });

    it('stale deadline epoch is ignored', () => {
        const s = startedAt(['a'], 0);
        const r = ok(s, { type: 'timer_fired', timer: 'question_deadline', epoch: s.timerEpoch - 1 }, 20000);
        expect(r.state).toEqual(s);
        expect(r.effects).toEqual([]);
    });

    it('earlyClose closes when all connected answered', () => {
        let s = startedAt(['a', 'b'], 0, { earlyClose: true });
        s = ok(s, ans('a', 1), 1000).state;
        expect(s.phase).toBe('question_open');
        s = ok(s, ans('b', 0), 2000).state;
        expect(s.phase).toBe('question_results');
    });

    it('disconnected player does not block earlyClose', () => {
        let s = startedAt(['a', 'b'], 0, { earlyClose: true });
        s = ok(s, { type: 'player_connection', playerId: 'b', connected: false }, 500).state;
        s = ok(s, ans('a', 1), 1000).state;
        expect(s.phase).toBe('question_results');
    });

    it('disconnect of the last unanswered player closes early', () => {
        let s = startedAt(['a', 'b'], 0, { earlyClose: true });
        s = ok(s, ans('a', 1), 1000).state;
        s = ok(s, { type: 'player_connection', playerId: 'b', connected: false }, 1500).state;
        expect(s.phase).toBe('question_results');
    });

    it('without earlyClose everyone answering does not close', () => {
        let s = startedAt(['a'], 0);
        s = ok(s, ans('a', 1), 1000).state;
        expect(s.phase).toBe('question_open');
    });

    it('auto mode schedules auto_advance after results', () => {
        const s = ok(startedAt(['a'], 0, { advanceMode: 'auto' }), ans('a', 1), 100).state;
        const r = closeByDeadline(s);
        expect(r.effects).toEqual([
            { type: 'schedule', timer: 'auto_advance', epoch: r.state.timerEpoch, at: 20000 + 8000 },
        ]);
        const next = ok(r.state, { type: 'timer_fired', timer: 'auto_advance', epoch: r.state.timerEpoch }, 28000);
        expect(next.state.phase).toBe('question_open');
        expect(next.state.questionIndex).toBe(1);
    });

    it('manual next invalidates a pending auto_advance', () => {
        const r = closeByDeadline(startedAt(['a'], 0, { advanceMode: 'auto' }));
        const staleEpoch = r.state.timerEpoch;
        const moved = ok(r.state, { type: 'next' }, 21000).state;
        const stale = ok(moved, { type: 'timer_fired', timer: 'auto_advance', epoch: staleEpoch }, 28000);
        expect(stale.state).toEqual(moved);
        expect(stale.effects).toEqual([]);
    });

    it('next after q1 results shows leaderboard (every 2)', () => {
        let s = closeByDeadline(startedAt(['a'], 0)).state;
        s = ok(s, { type: 'next' }, 21000).state; // open q1 at 21000
        expect(s.phase).toBe('question_open');
        s = closeByDeadline(s).state;
        const r = ok(s, { type: 'next' }, 41000);
        expect(r.state.phase).toBe('leaderboard');
        expect(r.state.questionIndex).toBe(1);
        const q2 = ok(r.state, { type: 'next' }, 42000);
        expect(q2.state.phase).toBe('question_open');
        expect(q2.state.questionIndex).toBe(2);
    });

    it('auto mode schedules auto_advance at the leaderboard', () => {
        let s = closeByDeadline(startedAt(['a'], 0, { advanceMode: 'auto' })).state;
        s = ok(s, { type: 'next' }, 21000).state;
        s = closeByDeadline(s).state;
        const r = ok(s, { type: 'next' }, 41000);
        expect(r.state.phase).toBe('leaderboard');
        expect(r.effects).toEqual([{ type: 'schedule', timer: 'auto_advance', epoch: r.state.timerEpoch, at: 49000 }]);
    });

    it('next after last results finishes completed with persist_history', () => {
        let s = closeByDeadline(startedAt(['a'], 0, { leaderboardEvery: 0 })).state;
        s = ok(s, { type: 'next' }, 21000).state;
        s = closeByDeadline(s).state;
        s = ok(s, { type: 'next' }, 41000).state;
        expect(s.questionIndex).toBe(2);
        s = closeByDeadline(s).state;
        const r = ok(s, { type: 'next' }, 61000);
        expect(r.state).toMatchObject({ phase: 'finished', outcome: 'completed' });
        expect(r.state.timerEpoch).toBe(s.timerEpoch + 1);
        expect(r.state.hostEpoch).toBe(s.hostEpoch + 1);
        expect(r.effects).toEqual([{ type: 'persist_history' }]);
    });

    it('last question skips the leaderboard even when index fits leaderboardEvery', () => {
        let s = closeByDeadline(startedAt(['a'], 0, { leaderboardEvery: 1 })).state;
        s = ok(s, { type: 'next' }, 21000).state; // leaderboard
        expect(s.phase).toBe('leaderboard');
        s = ok(s, { type: 'next' }, 22000).state; // q1
        s = closeByDeadline(s).state;
        s = ok(s, { type: 'next' }, 42000).state; // leaderboard
        s = ok(s, { type: 'next' }, 43000).state; // q2
        s = closeByDeadline(s).state;
        expect(ok(s, { type: 'next' }, 63000).state.phase).toBe('finished');
    });

    it('next during question_open → INVALID_PHASE', () => {
        expectCode(startedAt(['a'], 0), { type: 'next' }, 100, 'INVALID_PHASE');
    });

    it('next during pause → PAUSED', () => {
        const s = closeByDeadline(startedAt(['a'], 0)).state;
        const paused = ok(s, { type: 'pause' }, 1).state;
        expectCode(paused, { type: 'next' }, 30000, 'PAUSED');
    });

    it('numeric question accepts numeric answers and scores the closest', () => {
        let s = closeByDeadline(startedAt(['a'], 0, { leaderboardEvery: 0 })).state;
        s = ok(s, { type: 'next' }, 21000).state;
        s = closeByDeadline(s).state;
        s = ok(s, { type: 'next' }, 41000).state;
        const numeric: Command = {
            type: 'answer',
            playerId: 'a',
            questionIndex: 2,
            answer: { kind: 'numeric', value: 100 },
        };
        s = ok(s, numeric, 41000).state;
        s = closeByDeadline(s).state;
        expect(s.players.a?.score).toBe(1000);
        expectCode(
            startedAt(['a'], 0),
            { type: 'answer', playerId: 'a', questionIndex: 0, answer: { kind: 'numeric', value: 1 } },
            1,
            'INVALID_PAYLOAD',
        );
    });

    it('stale or mismatched timers in other phases are no-ops', () => {
        const s = startedAt(['a'], 0);
        const r = ok(s, { type: 'timer_fired', timer: 'auto_advance', epoch: s.timerEpoch }, 100);
        expect(r.state).toEqual(s);
        expect(r.effects).toEqual([]);
    });
});
