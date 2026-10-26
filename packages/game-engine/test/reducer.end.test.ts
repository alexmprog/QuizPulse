import { describe, expect, it } from 'vitest';
import { expectCode, lobbyWith, ok, startedAt } from './fixtures.js';

describe('end', () => {
    it('end mid-game finishes aborted, open question not scored', () => {
        const s = ok(
            startedAt(['a'], 0),
            { type: 'answer', playerId: 'a', questionIndex: 0, answer: { kind: 'option', option: 1 } },
            0,
        ).state;
        const r = ok(s, { type: 'end' }, 1000);
        expect(r.state).toMatchObject({ phase: 'finished', outcome: 'aborted', question: null, pause: null });
        expect(r.state.players.a?.score).toBe(0);
        expect(r.effects).toEqual([{ type: 'persist_history' }]);
        expect(r.state.timerEpoch).toBeGreaterThan(s.timerEpoch);
        // The finished state holds no unscored answers, so it can be saved to history as it is.
        expect(r.state.answers[0]).toBeUndefined();
    });

    it('end in question_results keeps the scored answers', () => {
        const s = ok(
            startedAt(['a'], 0),
            { type: 'answer', playerId: 'a', questionIndex: 0, answer: { kind: 'option', option: 1 } },
            1000,
        ).state;
        const closed = ok(s, { type: 'timer_fired', timer: 'question_deadline', epoch: s.timerEpoch }, 20000).state;
        const r = ok(closed, { type: 'end' }, 21000);
        expect(r.state.answers[0]?.a).toMatchObject({ correct: true });
        expect(r.state.players.a?.score).toBeGreaterThan(0);
    });

    it('end while paused works', () => {
        const p = ok(startedAt(['a'], 0), { type: 'pause' }, 10).state;
        expect(ok(p, { type: 'end' }, 20).state.outcome).toBe('aborted');
    });

    it('end in lobby emits close_lobby', () => {
        expect(ok(lobbyWith(['a']), { type: 'end' }, 5).effects).toEqual([{ type: 'close_lobby' }]);
    });

    it('end when finished → INVALID_PHASE', () => {
        const e = ok(startedAt(['a'], 0), { type: 'end' }, 100).state;
        expectCode(e, { type: 'end' }, 200, 'INVALID_PHASE');
    });
});
