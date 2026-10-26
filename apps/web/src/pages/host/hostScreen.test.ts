import type { GamePhase, PauseView } from '@quizpulse/protocol';
import { describe, expect, it } from 'vitest';
import { hostView, question } from '../../test/fixtures';
import {
    answerTiles,
    formatPin,
    hostScreen,
    isLocalJoinUrl,
    joinAddress,
    signedDiff,
    type HostScreen,
} from './hostScreen';

describe('hostScreen', () => {
    const rows: [GamePhase, PauseView | null, HostScreen][] = [
        ['lobby', null, 'lobby'],
        ['question_open', null, 'question'],
        ['question_results', null, 'results'],
        ['leaderboard', null, 'leaderboard'],
        ['finished', null, 'final'],
        ['question_open', { reason: 'host' }, 'pause'],
        ['question_results', { reason: 'host' }, 'pause'],
        ['leaderboard', { reason: 'host_disconnected' }, 'pause'],
        ['lobby', { reason: 'host_disconnected' }, 'lobby'],
        ['finished', { reason: 'host' }, 'final'],
    ];

    it.each(rows)('%s with pause %j → %s', (phase, pause, expected) => {
        expect(hostScreen(hostView({ phase, pause }))).toBe(expected);
    });
});

describe('host helpers', () => {
    it('formatPin splits the PIN in two groups', () => {
        expect(formatPin('482931')).toBe('482 931');
    });

    it('isLocalJoinUrl spots links phones cannot open', () => {
        expect(isLocalJoinUrl('http://localhost:8080/play?pin=1')).toBe(true);
        expect(isLocalJoinUrl('http://127.0.0.1:8080/play?pin=1')).toBe(true);
        expect(isLocalJoinUrl('http://[::1]:8080/play?pin=1')).toBe(true);
        expect(isLocalJoinUrl('http://192.168.1.42:8080/play?pin=1')).toBe(false);
        expect(isLocalJoinUrl('not a url')).toBe(false);
    });

    it('joinAddress drops the scheme and the query', () => {
        expect(joinAddress('http://192.168.1.42:8080/play?pin=482931')).toBe('192.168.1.42:8080/play');
        expect(joinAddress('not a url?pin=1')).toBe('not a url');
    });

    it('answerTiles puts True first on slot B and False on slot A', () => {
        const tf = answerTiles(question({ type: 'true_false', options: [] }), 'True', 'False');
        expect(tf).toEqual([
            { option: 0, slot: 1, label: 'True' },
            { option: 1, slot: 0, label: 'False' },
        ]);
        const choice = answerTiles(question({ options: ['a', 'b'] }), 'True', 'False');
        expect(choice).toEqual([
            { option: 0, slot: 0, label: 'a' },
            { option: 1, slot: 1, label: 'b' },
        ]);
        expect(answerTiles(question({ type: 'numeric', options: [] }), 'True', 'False')).toEqual([]);
    });

    it('signedDiff marks the sign with a real minus', () => {
        expect(signedDiff(141, 142)).toBe('−1');
        expect(signedDiff(145, 142)).toBe('+3');
        expect(signedDiff(142, 142)).toBe('0');
    });
});
