import { describe, expect, it } from 'vitest';
import type { Command, GameState } from '../src/index.js';
import { toHostView, toPlayerView } from '../src/views.js';
import { lobbyWith, ok } from './fixtures.js';
import type { QuizSettings } from '@quizpulse/protocol';

const url = (id: string): string => `http://img/${id}`;
const deadline = (s: GameState): Command => ({ type: 'timer_fired', timer: 'question_deadline', epoch: s.timerEpoch });
const opt = (playerId: string, option: number, questionIndex = 0): Command => ({
    type: 'answer',
    playerId,
    questionIndex,
    answer: { kind: 'option', option },
});

function open(ids: string[], settings: Partial<QuizSettings> = {}): GameState {
    return ok(lobbyWith(ids, settings), { type: 'start' }, 1000).state;
}
function closed(s: GameState, at = 21000): GameState {
    return ok(s, deadline(s), at).state;
}

describe('views: question visibility', () => {
    it('open question views never contain correct answer', () => {
        for (const s of [open(['a', 'b']), open(['a', 'b'])]) {
            const host = JSON.stringify(toHostView(s, 2000, url));
            const player = JSON.stringify(toPlayerView(s, 'a', 2000, url));
            for (const text of [host, player]) {
                expect(text).not.toContain('correctOption');
                expect(text).not.toContain('numericAnswer');
            }
        }
        // numeric question open
        let s = open(['a'], { leaderboardEvery: 0 });
        s = closed(s);
        s = ok(s, { type: 'next' }, 22000).state;
        s = closed(s, 42000);
        s = ok(s, { type: 'next' }, 43000).state;
        expect(s.questionIndex).toBe(2);
        expect(JSON.stringify(toHostView(s, 44000, url))).not.toContain('numericAnswer');
        expect(JSON.stringify(toPlayerView(s, 'a', 44000, url))).not.toContain('numericTolerance');
    });

    it('open question is exposed with image url and true/false options empty', () => {
        let s = open(['a'], { leaderboardEvery: 0 });
        s = ok(closed(s), { type: 'next' }, 22000).state;
        const v = toHostView(s, 23000, url);
        expect(v.question).toMatchObject({ index: 1, type: 'true_false', options: [], imageUrl: null });
    });

    it('paused question is hidden on both views', () => {
        const s = ok(open(['a']), { type: 'pause' }, 5000).state;
        expect(toHostView(s, 6000, url).question).toBeNull();
        expect(toPlayerView(s, 'a', 6000, url).question).toBeNull();
        expect(toHostView(s, 6000, url).pause).toEqual({ reason: 'host' });
        expect(toPlayerView(s, 'a', 6000, url).pause).toEqual({ reason: 'host' });
    });

    it('countdown remainingMs while paused equals remainingMsAtPause', () => {
        const s = ok(open(['a']), { type: 'pause' }, 5000).state;
        const c = toHostView(s, 9000, url).countdown;
        expect(c).toEqual({ closesAt: null, remainingMs: 16000, serverNow: 9000 });
        expect(toPlayerView(s, 'a', 9000, url).countdown?.remainingMs).toBe(16000);
    });

    it('countdown while running is closesAt - now, clamped at 0; none outside question_open', () => {
        const s = open(['a']);
        expect(toHostView(s, 6000, url).countdown).toEqual({ closesAt: 21000, remainingMs: 15000, serverNow: 6000 });
        expect(toHostView(s, 99000, url).countdown?.remainingMs).toBe(0);
        const r = closed(s);
        expect(toHostView(r, 22000, url).countdown).toBeNull();
        expect(toPlayerView(r, 'a', 22000, url).countdown).toBeNull();
        expect(toHostView(lobbyWith(['a']), 1, url).countdown).toBeNull();
    });

    it('lobby has no question', () => {
        const v = toHostView(lobbyWith(['a']), 1, url);
        expect(v).toMatchObject({ phase: 'lobby', question: null, results: null, leaderboard: null, answeredCount: 0 });
    });
});

describe('views: results', () => {
    it('results show optionCounts and noAnswerCount', () => {
        let s = open(['a', 'b', 'c']);
        s = ok(s, opt('a', 0), 2000).state;
        s = ok(s, opt('b', 0), 3000).state;
        s = closed(s);
        const v = toHostView(s, 22000, url);
        expect(v.phase).toBe('question_results');
        expect(v.question?.index).toBe(0);
        expect(v.results).toMatchObject({
            correctOption: 1,
            optionCounts: [2, 0, 0, 0],
            noAnswerCount: 1,
            closestNumeric: null,
        });
        expect(v.answeredCount).toBe(2);
    });

    it('numeric results show top-3 closest', () => {
        let s = open(['a', 'b', 'c', 'd'], { leaderboardEvery: 0 });
        s = ok(closed(s), { type: 'next' }, 22000).state;
        s = ok(closed(s, 42000), { type: 'next' }, 43000).state;
        const num = (p: string, value: number, at: number): GameState =>
            (s = ok(
                s,
                { type: 'answer', playerId: p, questionIndex: 2, answer: { kind: 'numeric', value } },
                at,
            ).state);
        num('a', 130, 44000);
        num('b', 101, 45000);
        num('c', 99, 46000);
        num('d', 90, 47000);
        s = closed(s, 63000);
        const r = toHostView(s, 64000, url).results;
        expect(r).toMatchObject({ numericAnswer: 100, numericTolerance: 5, optionCounts: null, noAnswerCount: 0 });
        expect(r?.closestNumeric).toEqual([
            { nickname: 'b', value: 101 }, // tie with c on distance, answered earlier
            { nickname: 'c', value: 99 },
            { nickname: 'd', value: 90 },
        ]);
    });

    it('player view in results shows myResult and answered', () => {
        let s = open(['a', 'b']);
        s = ok(s, opt('a', 1), 2000).state;
        const midA = toPlayerView(s, 'a', 3000, url);
        expect(midA).toMatchObject({ answered: true, myResult: null });
        expect(toPlayerView(s, 'b', 3000, url).answered).toBe(false);
        s = closed(s);
        const a = toPlayerView(s, 'a', 22000, url);
        const b = toPlayerView(s, 'b', 22000, url);
        expect(a.answered).toBe(true);
        expect(a.myResult?.correct).toBe(true);
        expect(a.myResult?.points).toBeGreaterThan(0);
        expect(a.me.score).toBe(a.myResult?.points);
        expect(b.answered).toBe(false);
        expect(b.myResult).toEqual({ correct: false, points: 0 });
        expect(a).not.toHaveProperty('results');
    });

    it('host sees per-player answered flags and answeredCount while open', () => {
        const s = ok(open(['a', 'b']), opt('a', 1), 2000).state;
        const v = toHostView(s, 3000, url);
        expect(v.answeredCount).toBe(1);
        expect(v.players.map((p) => [p.id, p.answered])).toEqual([
            ['a', true],
            ['b', false],
        ]);
        expect(v.results).toBeNull();
    });
});

describe('views: leaderboard and finish', () => {
    function manyPlayers(n: number): string[] {
        return Array.from({ length: n }, (_, i) => `p${String(i).padStart(2, '0')}`);
    }

    it('leaderboard is top-10 during leaderboard phase and full when finished', () => {
        const ids = manyPlayers(12);
        let s = open(ids, { leaderboardEvery: 1 });
        s = ok(s, opt('p05', 1), 2000).state;
        s = closed(s);
        expect(toHostView(s, 22000, url).leaderboard).toBeNull();
        s = ok(s, { type: 'next' }, 23000).state;
        expect(s.phase).toBe('leaderboard');
        const host = toHostView(s, 24000, url);
        expect(host.leaderboard).toHaveLength(10);
        expect(host.leaderboard?.[0]).toMatchObject({ playerId: 'p05', rank: 1 });
        expect(host.leaderboard?.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(host.question?.index).toBe(0);
        expect(toPlayerView(s, 'p05', 24000, url).me.rank).toBe(1);
        expect(toPlayerView(s, 'p05', 24000, url).podium).toBeNull();
        expect(toPlayerView(s, 'p11', 24000, url).me.rank).toBe(12);

        const f = ok(s, { type: 'end' }, 25000).state;
        const fh = toHostView(f, 26000, url);
        expect(fh.leaderboard).toHaveLength(12);
        expect(fh.question).toBeNull();
        expect(fh.outcome).toBe('aborted');
        const fp = toPlayerView(f, 'p05', 26000, url);
        expect(fp.podium?.map((e) => e.playerId)).toEqual(['p05', 'p00', 'p01']);
        expect(fp.me.rank).toBe(1);
        expect(fp.outcome).toBe('aborted');
    });

    it('rank is null outside leaderboard and finished', () => {
        const s = open(['a']);
        expect(toPlayerView(s, 'a', 2000, url).me.rank).toBeNull();
    });
});

describe('views: players', () => {
    it('kicked players excluded', () => {
        let s = lobbyWith(['a', 'b', 'c']);
        s = ok(s, { type: 'kick', playerId: 'b' }, 10).state;
        const v = toHostView(s, 20, url);
        expect(v.players.map((p) => p.id)).toEqual(['a', 'c']);
        s = ok(s, { type: 'start' }, 30).state;
        s = ok(s, { type: 'end' }, 40).state;
        expect(toHostView(s, 50, url).leaderboard?.map((e) => e.playerId)).toEqual(['a', 'c']);
        expect(toPlayerView(s, 'a', 50, url).podium?.map((e) => e.playerId)).toEqual(['a', 'c']);
    });
});

describe('views: web additions', () => {
    const resume = (s: GameState, at: number): GameState => ok(s, { type: 'resume' }, at).state;
    const pause = (s: GameState, at: number): GameState => ok(s, { type: 'pause' }, at).state;

    it('autoAdvance set in results with auto mode and null in manual', () => {
        const auto = closed(open(['a'], { advanceMode: 'auto', autoAdvanceSeconds: 8 }));
        expect(toHostView(auto, 23000, url).autoAdvance).toEqual({
            closesAt: 29000,
            remainingMs: 6000,
            serverNow: 23000,
        });
        expect(toHostView(auto, 40000, url).autoAdvance?.remainingMs).toBe(0);
        expect(toHostView(closed(open(['a'])), 23000, url).autoAdvance).toBeNull();
        expect(toHostView(open(['a'], { advanceMode: 'auto' }), 2000, url).autoAdvance).toBeNull();
    });

    it('autoAdvance is set at the leaderboard too', () => {
        let s = closed(open(['a'], { advanceMode: 'auto', leaderboardEvery: 1 }));
        s = ok(s, { type: 'next' }, 22000).state;
        expect(s.phase).toBe('leaderboard');
        expect(toHostView(s, 23000, url).autoAdvance).toEqual({ closesAt: 30000, remainingMs: 7000, serverNow: 23000 });
    });

    it('autoAdvance is null for a state written before advanceAt existed', () => {
        const auto = closed(open(['a'], { advanceMode: 'auto', autoAdvanceSeconds: 8 }));
        const legacy = { ...auto } as Partial<GameState>;
        delete legacy.advanceAt;
        expect(toHostView(legacy as GameState, 23000, url).autoAdvance).toBeNull();
    });

    it('autoAdvance null while paused and recomputed after resume', () => {
        let s = closed(open(['a'], { advanceMode: 'auto', autoAdvanceSeconds: 8 }));
        s = pause(s, 22000);
        expect(toHostView(s, 23000, url).autoAdvance).toBeNull();
        s = resume(s, 50000);
        expect(toHostView(s, 51000, url).autoAdvance).toEqual({ closesAt: 58000, remainingMs: 7000, serverNow: 51000 });
    });

    it('myAnswer shown to its owner only and hidden during pause', () => {
        let s = open(['a', 'b']);
        s = ok(s, opt('a', 2), 3000).state;
        expect(toPlayerView(s, 'a', 4000, url).myAnswer).toEqual({ kind: 'option', option: 2 });
        expect(toPlayerView(s, 'b', 4000, url).myAnswer).toBeNull();
        expect(toPlayerView(pause(s, 5000), 'a', 6000, url).myAnswer).toBeNull();
        const results = closed(s);
        expect(toPlayerView(results, 'a', 22000, url).myAnswer).toEqual({ kind: 'option', option: 2 });
        expect(toPlayerView(results, 'b', 22000, url).myAnswer).toBeNull();
        expect(JSON.stringify(toPlayerView(s, 'a', 4000, url))).not.toContain('correct');
    });

    it('playerCount excludes kicked', () => {
        let s = lobbyWith(['a', 'b', 'c']);
        expect(toPlayerView(s, 'a', 10, url).playerCount).toBe(3);
        s = ok(s, { type: 'kick', playerId: 'c' }, 10).state;
        expect(toPlayerView(s, 'a', 10, url).playerCount).toBe(2);
    });
});
