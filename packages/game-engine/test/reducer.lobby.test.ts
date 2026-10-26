import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, NICKNAME_MAX } from '@quizpulse/protocol';
import { nicknameSchema } from '@quizpulse/protocol';
import { normalizeNickname, reduce } from '../src/index.js';
import { expectCode, lobbyWith, newGame, ok } from './fixtures.js';

describe('lobby', () => {
    it('join normalizes nickname', () => {
        const s = ok(newGame(), { type: 'player_join', playerId: 'p1', nickname: '  Ann   Lee ' }, 5).state;
        expect(s.players.p1).toMatchObject({
            nickname: 'Ann Lee',
            joinedAt: 5,
            connected: true,
            kicked: false,
            score: 0,
        });
        expect(s.playerOrder).toEqual(['p1']);
    });

    it('normalizeNickname agrees with the protocol schema', () => {
        for (const raw of ['  a  b ', 'x\t\ny', 'plain']) {
            expect(normalizeNickname(raw)).toBe(nicknameSchema.parse(raw));
        }
    });

    it('join rejects empty nickname after normalization', () => {
        expectCode(newGame(), { type: 'player_join', playerId: 'p1', nickname: '   ' }, 1, 'INVALID_PAYLOAD');
    });

    it('join rejects case-insensitive duplicate', () => {
        const s = lobbyWith(['Ann']);
        expectCode(s, { type: 'player_join', playerId: 'p2', nickname: ' aNN ' }, 9, 'NICKNAME_TAKEN');
    });

    it('join rejects 51st player', () => {
        const ids = Array.from({ length: MAX_PLAYERS }, (_, i) => `p${String(i)}`);
        const s = lobbyWith(ids);
        expectCode(s, { type: 'player_join', playerId: 'extra', nickname: 'extra' }, 99, 'GAME_FULL');
    });

    it('join after start → GAME_ALREADY_STARTED', () => {
        const s = ok(lobbyWith(['a']), { type: 'start' }, 10).state;
        expectCode(s, { type: 'player_join', playerId: 'late', nickname: 'late' }, 11, 'GAME_ALREADY_STARTED');
    });

    it('kick emits notify_kicked and frees nickname', () => {
        const s = lobbyWith(['Ann']);
        const r = ok(s, { type: 'kick', playerId: 'Ann' }, 5);
        expect(r.effects).toEqual([{ type: 'notify_kicked', playerId: 'Ann' }]);
        expect(r.state.players.Ann?.kicked).toBe(true);
        const again = ok(r.state, { type: 'player_join', playerId: 'p2', nickname: 'ann' }, 6);
        expect(again.state.players.p2?.nickname).toBe('ann');
    });

    it('kicked players do not count toward the cap', () => {
        const ids = Array.from({ length: MAX_PLAYERS }, (_, i) => `p${String(i)}`);
        const s = ok(lobbyWith(ids), { type: 'kick', playerId: 'p0' }, 99).state;
        ok(s, { type: 'player_join', playerId: 'new', nickname: 'new' }, 100);
    });

    it('start without players → NO_PLAYERS', () => {
        expectCode(newGame(), { type: 'start' }, 1, 'NO_PLAYERS');
        const s = ok(lobbyWith(['a']), { type: 'kick', playerId: 'a' }, 5).state;
        expectCode(s, { type: 'start' }, 6, 'NO_PLAYERS');
    });

    it('kick outside the lobby → INVALID_PHASE; unknown player → INVALID_PAYLOAD', () => {
        const s = lobbyWith(['a']);
        expectCode(s, { type: 'kick', playerId: 'zzz' }, 5, 'INVALID_PAYLOAD');
        const started = ok(s, { type: 'start' }, 10).state;
        expectCode(started, { type: 'kick', playerId: 'a' }, 11, 'INVALID_PHASE');
    });

    it('reduce does not mutate its input', () => {
        const s = lobbyWith(['a']);
        const snapshot = structuredClone(s);
        reduce(s, { type: 'start' }, 10);
        expect(s).toEqual(snapshot);
    });

    it('rejects nicknames longer than NICKNAME_MAX after normalization', () => {
        const long = 'x'.repeat(NICKNAME_MAX + 1);
        expectCode(newGame(), { type: 'player_join', playerId: 'p1', nickname: long }, 1, 'INVALID_PAYLOAD');
        const ok20 = 'y'.repeat(NICKNAME_MAX);
        expect(reduce(newGame(), { type: 'player_join', playerId: 'p1', nickname: ` ${ok20} ` }, 1).ok).toBe(true);
    });

    it('GAME_FULL wins over NICKNAME_TAKEN', () => {
        const ids = Array.from({ length: MAX_PLAYERS }, (_, i) => `p${String(i)}`);
        const s = lobbyWith(ids);
        expectCode(s, { type: 'player_join', playerId: 'extra', nickname: 'p0' }, 99, 'GAME_FULL');
    });
});
