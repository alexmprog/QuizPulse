import { nicknameSchema, type PlayerAnswer, type PlayerView, type QuestionPublic } from '@quizpulse/protocol';
import type { PlayerExit } from '../../game/usePlayerGame';
import type { Lang } from '../../i18n/i18n';
import { answerTiles, type AnswerTile } from '../host/hostScreen';

export type PlayerScreen =
    'pin' | 'nickname' | 'lobby' | 'answer' | 'accepted' | 'pause' | 'result' | 'rank' | 'final' | 'kicked' | 'closed';

/**
 * Which remote screen to show. An exit wins over everything; without a snapshot the PIN decides between the PIN
 * entry and the nickname step; a pause hides any running phase (the lobby and the final ignore it).
 */
export function playerScreen(
    v: PlayerView | null,
    local: { exit: PlayerExit | null; pin: string | null },
): PlayerScreen {
    if (local.exit) return local.exit;
    if (!v) return local.pin ? 'nickname' : 'pin';
    if (v.phase === 'lobby') return 'lobby';
    if (v.phase === 'finished') return 'final';
    if (v.pause !== null) return 'pause';
    if (v.phase === 'question_open') return v.answered ? 'accepted' : 'answer';
    if (v.phase === 'question_results') return 'result';
    return 'rank';
}

/** The nickname as the server will store it (trimmed, inner whitespace collapsed); its length drives the counter. */
export function normalizeNickname(raw: string): string {
    return nicknameSchema.in.parse(raw);
}

/** «3,5» or «3.5» → 3.5; anything that is not a finite number → null. */
export function parseDecimal(raw: string): number | null {
    const s = raw.trim().replace(',', '.');
    if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/** A number the way the player typed it: every digit kept, the decimal comma in Russian. */
export function formatAnswerNumber(lang: Lang, value: number): string {
    const s = String(value);
    return lang === 'ru' ? s.replace('.', ',') : s;
}

/** The tile of the player's own option answer, or null for a numeric answer, no answer or an unknown option. */
export function chosenTile(
    q: QuestionPublic | null,
    a: PlayerAnswer | null,
    trueLabel: string,
    falseLabel: string,
): AnswerTile | null {
    if (!q || a?.kind !== 'option') return null;
    return answerTiles(q, trueLabel, falseLabel).find((tile) => tile.option === a.option) ?? null;
}

export type ResultTone = 'success' | 'danger' | 'neutral';

/** How a question ended for the player. No answer (or no result for it) is neutral: running out of time is no error. */
export function resultTone(v: PlayerView): ResultTone {
    if (!v.answered || v.myResult === null) return 'neutral';
    return v.myResult.correct ? 'success' : 'danger';
}
