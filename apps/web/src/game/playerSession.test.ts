import { describe, expect, it } from 'vitest';
import { clearSession, loadSession, saveSession, type PlayerSession } from './playerSession';

const SESSION: PlayerSession = { pin: '123456', gameId: 'g1', playerId: 'p1', playerToken: 't1' };

describe('playerSession', () => {
    it('is empty by default', () => {
        expect(loadSession()).toBeNull();
    });

    it('saves, loads and clears the session under qp.player', () => {
        saveSession(SESSION);
        expect(JSON.parse(localStorage.getItem('qp.player') ?? 'null')).toEqual(SESSION);
        expect(loadSession()).toEqual(SESSION);
        clearSession();
        expect(loadSession()).toBeNull();
        expect(localStorage.getItem('qp.player')).toBeNull();
    });

    it('ignores broken or incomplete data', () => {
        localStorage.setItem('qp.player', '{not json');
        expect(loadSession()).toBeNull();
        localStorage.setItem('qp.player', JSON.stringify({ pin: '123456', gameId: 'g1' }));
        expect(loadSession()).toBeNull();
    });
});
