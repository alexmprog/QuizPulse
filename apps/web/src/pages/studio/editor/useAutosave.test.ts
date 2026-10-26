import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onUnauthenticated, setCsrfToken, type Schemas } from '../../../api/client';
import { quizzesApi } from '../../../api/quizzes';
import { toDraft, toInput, type Draft, type FieldErrors } from './draft';
import { readStash, stashDraft } from './draftStash';
import { QUIZ } from './fixtures';
import { useAutosave } from './useAutosave';

const NO_ERRORS: FieldErrors = {};
const BAD: FieldErrors = { title: true };

interface Props {
    draft: Draft | null;
    errors: FieldErrors;
}

function setup(initial: Draft = toDraft(QUIZ)) {
    return renderHook((p: Props) => useAutosave(QUIZ.id, p.draft, p.errors), {
        initialProps: { draft: initial, errors: NO_ERRORS },
    });
}

const edit = (d: Draft, title: string): Draft => ({ ...d, title });

describe('useAutosave', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('starts saved and does not save the loaded draft', () => {
        const replace = vi.spyOn(quizzesApi, 'replace');
        const { result } = setup();
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(result.current.status).toBe('saved');
        expect(replace).not.toHaveBeenCalled();
    });

    it('debounces edits into one PUT', async () => {
        const replace = vi.spyOn(quizzesApi, 'replace').mockResolvedValue(QUIZ);
        const base = toDraft(QUIZ);
        const { result, rerender } = setup(base);
        rerender({ draft: edit(base, 'a'), errors: NO_ERRORS });
        expect(result.current.status).toBe('dirty');
        act(() => {
            vi.advanceTimersByTime(500);
        });
        const last = edit(base, 'ab');
        rerender({ draft: last, errors: NO_ERRORS });
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(replace).not.toHaveBeenCalled();
        await act(async () => {
            vi.advanceTimersByTime(300);
            await Promise.resolve();
        });
        expect(replace).toHaveBeenCalledTimes(1);
        expect(replace).toHaveBeenCalledWith(QUIZ.id, toInput(last));
        expect(result.current.status).toBe('saved');
    });

    it('does not save an invalid draft', () => {
        const replace = vi.spyOn(quizzesApi, 'replace').mockResolvedValue(QUIZ);
        const base = toDraft(QUIZ);
        const { result, rerender } = setup(base);
        rerender({ draft: edit(base, ''), errors: BAD });
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(replace).not.toHaveBeenCalled();
        expect(result.current.status).toBe('invalid');
    });

    it('edit during in-flight save triggers a second PUT', async () => {
        const resolvers: ((q: Schemas['Quiz']) => void)[] = [];
        const replace = vi.spyOn(quizzesApi, 'replace').mockImplementation(
            () =>
                new Promise((res) => {
                    resolvers.push(res);
                }),
        );
        const base = toDraft(QUIZ);
        const { result, rerender } = setup(base);
        rerender({ draft: edit(base, 'one'), errors: NO_ERRORS });
        await act(async () => {
            vi.advanceTimersByTime(800);
            await Promise.resolve();
        });
        expect(replace).toHaveBeenCalledTimes(1);
        expect(result.current.status).toBe('saving');

        const second = edit(base, 'two');
        rerender({ draft: second, errors: NO_ERRORS });
        await act(async () => {
            vi.advanceTimersByTime(2000);
            await Promise.resolve();
        });
        expect(replace).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolvers[0]?.(QUIZ);
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(replace).toHaveBeenCalledTimes(2);
        expect(replace).toHaveBeenLastCalledWith(QUIZ.id, toInput(second));
        expect(result.current.status).toBe('saving');

        await act(async () => {
            resolvers[1]?.(QUIZ);
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(result.current.status).toBe('saved');
    });

    it('a failed save shows failed and retry sends the draft again', async () => {
        const replace = vi
            .spyOn(quizzesApi, 'replace')
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce(QUIZ);
        const base = toDraft(QUIZ);
        const { result, rerender } = setup(base);
        rerender({ draft: edit(base, 'x'), errors: NO_ERRORS });
        await act(async () => {
            vi.advanceTimersByTime(800);
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(result.current.status).toBe('failed');
        await act(async () => {
            result.current.retry();
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(replace).toHaveBeenCalledTimes(2);
        expect(result.current.status).toBe('saved');
    });

    it('UNAUTHENTICATED sets failed and calls onUnauthenticated', async () => {
        setCsrfToken('t');
        const fetchMock = vi.fn(() =>
            Promise.resolve(new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), { status: 401 })),
        );
        vi.stubGlobal('fetch', fetchMock);
        const cb = vi.fn();
        const off = onUnauthenticated(cb);
        const base = toDraft(QUIZ);
        const { result, rerender } = setup(base);
        rerender({ draft: edit(base, 'x'), errors: NO_ERRORS });
        await act(async () => {
            vi.advanceTimersByTime(800);
            for (let i = 0; i < 10; i++) await Promise.resolve();
        });
        off();
        vi.unstubAllGlobals();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledTimes(1);
        expect(result.current.status).toBe('failed');
        // The refused draft is stashed for after the next sign-in.
        expect(readStash(QUIZ.id)).toEqual(edit(base, 'x'));
        sessionStorage.clear();
    });

    it('with a loaded quiz given, a different first draft is sent and the stash dropped', async () => {
        const replace = vi.spyOn(quizzesApi, 'replace').mockResolvedValue(QUIZ);
        const base = toDraft(QUIZ);
        const restored = edit(base, 'restored');
        stashDraft(QUIZ.id, restored);
        const { result } = renderHook(() => useAutosave(QUIZ.id, restored, NO_ERRORS, base));
        expect(result.current.status).toBe('dirty');
        await act(async () => {
            vi.advanceTimersByTime(800);
            await Promise.resolve();
        });
        expect(replace).toHaveBeenCalledWith(QUIZ.id, toInput(restored));
        expect(result.current.status).toBe('saved');
        expect(readStash(QUIZ.id)).toBeNull();
    });

    it('warns before unload only while there are unsaved edits', () => {
        const base = toDraft(QUIZ);
        const { rerender } = setup(base);
        const clean = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(clean);
        expect(clean.defaultPrevented).toBe(false);
        rerender({ draft: edit(base, 'x'), errors: NO_ERRORS });
        const dirty = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(dirty);
        expect(dirty.defaultPrevented).toBe(true);
    });

    it('sends the edit made during an in-flight save even if the editor unmounts first', async () => {
        const resolvers: ((q: Schemas['Quiz']) => void)[] = [];
        const replace = vi.spyOn(quizzesApi, 'replace').mockImplementation(
            () =>
                new Promise((res) => {
                    resolvers.push(res);
                }),
        );
        const base = toDraft(QUIZ);
        const { rerender, unmount } = setup(base);
        rerender({ draft: edit(base, 'one'), errors: NO_ERRORS });
        await act(async () => {
            vi.advanceTimersByTime(800);
            await Promise.resolve();
        });
        const second = edit(base, 'two');
        rerender({ draft: second, errors: NO_ERRORS });
        unmount();
        expect(replace).toHaveBeenCalledTimes(1);
        await act(async () => {
            resolvers[0]?.(QUIZ);
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(replace).toHaveBeenCalledTimes(2);
        expect(replace).toHaveBeenLastCalledWith(QUIZ.id, toInput(second));
    });

    it('unmounting with a pending debounce sends the edit', () => {
        const replace = vi.spyOn(quizzesApi, 'replace').mockResolvedValue(QUIZ);
        const base = toDraft(QUIZ);
        const { rerender, unmount } = setup(base);
        const last = edit(base, 'x');
        rerender({ draft: last, errors: NO_ERRORS });
        unmount();
        expect(replace).toHaveBeenCalledTimes(1);
        expect(replace).toHaveBeenCalledWith(QUIZ.id, toInput(last));
    });

    it('unmounting after a failed save does not send again', async () => {
        const replace = vi.spyOn(quizzesApi, 'replace').mockRejectedValue(new Error('boom'));
        const base = toDraft(QUIZ);
        const { result, rerender, unmount } = setup(base);
        rerender({ draft: edit(base, 'x'), errors: NO_ERRORS });
        await act(async () => {
            vi.advanceTimersByTime(800);
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(result.current.status).toBe('failed');
        unmount();
        expect(replace).toHaveBeenCalledTimes(1);
    });

    it('an edit that only adds surrounding spaces saves once and ends saved', async () => {
        const replace = vi.spyOn(quizzesApi, 'replace').mockResolvedValue(QUIZ);
        const base = toDraft(QUIZ);
        const { result, rerender } = setup(base);
        rerender({ draft: edit(base, `${base.title} `), errors: NO_ERRORS });
        await act(async () => {
            vi.advanceTimersByTime(800);
            await Promise.resolve();
            await Promise.resolve();
        });
        await act(async () => {
            vi.advanceTimersByTime(5000);
            await Promise.resolve();
        });
        expect(replace).toHaveBeenCalledTimes(1);
        expect(result.current.status).toBe('saved');
    });
});
