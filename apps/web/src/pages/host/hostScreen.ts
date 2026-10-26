import type { HostPlayerView, HostView, QuestionPublic } from '@quizpulse/protocol';
import { FALSE_SLOT, TRUE_SLOT } from '../../ui/AnswerSlot';

export type HostScreen = 'lobby' | 'question' | 'pause' | 'results' | 'leaderboard' | 'final';

/** Which big-screen view a snapshot shows: a pause hides any running phase; the lobby and the final ignore it. */
export function hostScreen(v: HostView): HostScreen {
    if (v.phase === 'lobby') return 'lobby';
    if (v.phase === 'finished') return 'final';
    if (v.pause !== null) return 'pause';
    if (v.phase === 'question_open') return 'question';
    if (v.phase === 'question_results') return 'results';
    return 'leaderboard';
}

/** «482 931»: the PIN in two groups of three. */
export function formatPin(pin: string): string {
    return `${pin.slice(0, 3)} ${pin.slice(3)}`;
}

/** The join address to read off the screen: host and path, without the scheme and `?pin=`. */
/** The join link points at this machine only (`PUBLIC_BASE_URL` left at localhost): phones cannot open it. */
export function isLocalJoinUrl(joinUrl: string): boolean {
    try {
        const host = new URL(joinUrl).hostname;
        return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    } catch {
        return false;
    }
}

export function joinAddress(joinUrl: string): string {
    try {
        const u = new URL(joinUrl);
        return u.host + u.pathname;
    } catch {
        return joinUrl.split('?')[0] ?? joinUrl;
    }
}

export interface AnswerTile {
    /** The option index the server counts (`optionCounts`, `correctOption`). */
    option: number;
    /** The visual slot (colour and shape). */
    slot: number;
    label: string;
}

/** Answer tiles in screen order. True/false: «True» (option 0) first on slot B, «False» (option 1) on slot A. */
export function answerTiles(q: QuestionPublic, trueLabel: string, falseLabel: string): AnswerTile[] {
    if (q.type === 'numeric') return [];
    if (q.type === 'true_false') {
        return [
            { option: 0, slot: TRUE_SLOT, label: trueLabel },
            { option: 1, slot: FALSE_SLOT, label: falseLabel },
        ];
    }
    return q.options.map((label, i) => ({ option: i, slot: i, label }));
}

/** «−1» / «+3» / «0»: how far a guess is from the answer (rounded to 3 decimals). */
export function signedDiff(value: number, answer: number): string {
    const d = Math.round((value - answer) * 1000) / 1000;
    if (d === 0) return '0';
    return d > 0 ? `+${String(d)}` : `−${String(-d)}`;
}

/**
 * «N / M answered»: M counts connected players plus anyone who already answered, so a player who answered and then
 * dropped does not push N above M.
 */
export function answeredOf(v: HostView): { answered: number; total: number } {
    const total = v.players.filter((p) => p.connected || p.answered).length;
    return { answered: v.answeredCount, total: Math.max(total, v.answeredCount) };
}

export function onlineCount(players: HostPlayerView[]): number {
    return players.filter((p) => p.connected).length;
}
