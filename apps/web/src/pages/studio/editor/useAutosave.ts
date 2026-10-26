import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../api/client';
import { quizzesApi } from '../../../api/quizzes';
import { toInput, type Draft, type FieldErrors } from './draft';
import { clearStash, stashDraft } from './draftStash';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'invalid' | 'failed';

export const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * Saves the draft 800 ms after the last edit. `loaded` (the quiz as the server has it) counts as saved; without it
 * the draft first passed in does.
 * One PUT is in flight at a time; edits made meanwhile are sent right after it finishes.
 * A 401 reaches the app through `onUnauthenticated` (the client fires it, and the editor is unmounted for the
 * login page): the unsaved draft is stashed first (`draftStash`) and the first successful save drops the stash.
 */
export function useAutosave(
    id: string,
    draft: Draft | null,
    errors: FieldErrors,
    loaded: Draft | null = null,
): { status: SaveStatus; retry: () => void } {
    const [savedDraft, setSavedDraft] = useState<Draft | null>(null);
    const [failedDraft, setFailedDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);
    const saved = useRef<Draft | null>(null);
    const latest = useRef({ draft, errors });
    const inFlight = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const alive = useRef(true);
    const flushRef = useRef<() => void>(() => undefined);

    // The first draft (or the loaded quiz, when given) is the saved one.
    if (draft !== null && savedDraft === null) setSavedDraft(loaded ?? draft);

    useEffect(() => {
        latest.current = { draft, errors };
        if (draft !== null) saved.current ??= loaded ?? draft;
    });

    useEffect(() => {
        flushRef.current = () => {
            if (inFlight.current) return;
            const snapshot = latest.current.draft;
            if (!snapshot || snapshot === saved.current || Object.keys(latest.current.errors).length > 0) return;
            inFlight.current = true;
            setSaving(true);
            setFailedDraft(null);
            quizzesApi.replace(id, toInput(snapshot)).then(
                () => {
                    inFlight.current = false;
                    saved.current = snapshot;
                    clearStash(id);
                    const { draft: now, errors: nowErrors } = latest.current;
                    const more = now !== null && now !== snapshot && Object.keys(nowErrors).length === 0;
                    if (alive.current) {
                        setSavedDraft(snapshot);
                        if (!more) setSaving(false);
                    }
                    if (more) {
                        // Edits made during the request go out right after it, even if the editor is gone by now.
                        clearTimeout(timer.current);
                        timer.current = undefined;
                        flushRef.current();
                    }
                },
                (e: unknown) => {
                    inFlight.current = false;
                    // Before the alive check: the sign-in redirect may already be unmounting the editor.
                    if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') {
                        stashDraft(id, latest.current.draft ?? snapshot);
                    }
                    if (!alive.current) return;
                    setSaving(false);
                    setFailedDraft(latest.current.draft);
                },
            );
        };
    }, [id]);

    useEffect(() => {
        if (!draft || draft === saved.current) return;
        clearTimeout(timer.current);
        if (Object.keys(errors).length > 0) return;
        timer.current = setTimeout(() => {
            timer.current = undefined;
            flushRef.current();
        }, AUTOSAVE_DEBOUNCE_MS);
    }, [draft, errors]);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            // Leaving the editor with a pending edit sends it instead of dropping it.
            if (timer.current !== undefined) {
                clearTimeout(timer.current);
                timer.current = undefined;
                flushRef.current();
            }
        };
    }, []);

    const dirty = draft !== null && savedDraft !== null && draft !== savedDraft;
    const status: SaveStatus =
        dirty && Object.keys(errors).length > 0
            ? 'invalid'
            : saving
              ? 'saving'
              : failedDraft !== null && failedDraft === draft
                ? 'failed'
                : dirty
                  ? 'dirty'
                  : 'saved';

    const unsaved = status === 'dirty' || status === 'saving' || status === 'failed';
    useEffect(() => {
        if (!unsaved) return;
        const warn = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', warn);
        return () => {
            window.removeEventListener('beforeunload', warn);
        };
    }, [unsaved]);

    const retry = useCallback(() => {
        flushRef.current();
    }, []);

    return { status, retry };
}
