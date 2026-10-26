import { describe, expect, it } from 'vitest';
import { rankPlayers } from '../src/index.js';

const p = (playerId: string, score: number, correctMs: number, joinedAt: number) => ({
    playerId,
    nickname: playerId,
    score,
    correctMs,
    joinedAt,
});

describe('rankPlayers', () => {
    it('ranking tie broken by correctMs then joinedAt', () => {
        const res = rankPlayers([p('d', 100, 500, 1), p('c', 100, 400, 9), p('b', 100, 400, 2), p('a', 200, 999, 5)]);
        expect(res.map((r) => r.playerId)).toEqual(['a', 'b', 'c', 'd']);
    });
    it('ranks are 1..n', () => {
        const res = rankPlayers([p('a', 5, 1, 1), p('b', 5, 1, 1), p('c', 5, 1, 1)]);
        expect(res.map((r) => r.rank)).toEqual([1, 2, 3]);
    });
    it('does not mutate input', () => {
        const input = [p('a', 1, 1, 1), p('b', 2, 1, 1)];
        rankPlayers(input);
        expect(input[0]?.playerId).toBe('a');
    });
});
