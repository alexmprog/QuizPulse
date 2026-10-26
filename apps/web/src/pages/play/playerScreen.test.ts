import type { GamePhase, PauseView } from '@quizpulse/protocol';
import { describe, expect, it } from 'vitest';
import type { PlayerExit } from '../../game/usePlayerGame';
import { playerView } from '../../test/fixtures';
import { playerScreen, type PlayerScreen } from './playerScreen';

describe('playerScreen', () => {
    const rows: [GamePhase, PauseView | null, boolean, PlayerScreen][] = [
        ['lobby', null, false, 'lobby'],
        ['question_open', null, false, 'answer'],
        ['question_open', null, true, 'accepted'],
        ['question_results', null, true, 'result'],
        ['leaderboard', null, false, 'rank'],
        ['finished', null, false, 'final'],
        ['question_open', { reason: 'host' }, false, 'pause'],
        ['question_open', { reason: 'host_disconnected' }, true, 'pause'],
        ['question_results', { reason: 'host' }, false, 'pause'],
        ['leaderboard', { reason: 'host_disconnected' }, false, 'pause'],
        ['lobby', { reason: 'host_disconnected' }, false, 'lobby'],
        ['finished', { reason: 'host' }, false, 'final'],
    ];

    it.each(rows)('%s with pause %j, answered %s → %s', (phase, pause, answered, expected) => {
        expect(playerScreen(playerView({ phase, pause, answered }), { exit: null, pin: '123456' })).toBe(expected);
    });

    it('without a view: nickname when the PIN is known, else the PIN entry', () => {
        expect(playerScreen(null, { exit: null, pin: '123456' })).toBe('nickname');
        expect(playerScreen(null, { exit: null, pin: null })).toBe('pin');
    });

    it.each<PlayerExit>(['kicked', 'closed'])('exit %s wins over any view', (exit) => {
        expect(playerScreen(playerView({ phase: 'question_open' }), { exit, pin: '123456' })).toBe(exit);
        expect(playerScreen(null, { exit, pin: null })).toBe(exit);
    });
});
