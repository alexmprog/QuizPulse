import type { Draft } from './draft';

/**
 * A draft the server refused with `UNAUTHENTICATED`, kept in sessionStorage (`qp.draft.<quizId>`) while the host
 * signs in again; the editor puts it back over the loaded quiz. Storage errors (private mode, quota) are ignored.
 */
const key = (quizId: string) => `qp.draft.${quizId}`;

export function stashDraft(quizId: string, draft: Draft): void {
    try {
        sessionStorage.setItem(key(quizId), JSON.stringify(draft));
    } catch {
        /* no storage: the edit is lost as before, the status still says "Not saved" */
    }
}

export function readStash(quizId: string): Draft | null {
    try {
        const raw = sessionStorage.getItem(key(quizId));
        if (raw === null) return null;
        const d = JSON.parse(raw) as Partial<Draft> | null;
        return d && typeof d.title === 'string' && Array.isArray(d.questions) && d.settings ? (d as Draft) : null;
    } catch {
        return null;
    }
}

export function clearStash(quizId: string): void {
    try {
        sessionStorage.removeItem(key(quizId));
    } catch {
        /* nothing to clear */
    }
}
