import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from './auth';
import { ApiError, api, onUnauthenticated, setCsrfToken } from './client';

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };

function reply({ status = 200, body, headers }: Reply = {}): Response {
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function csrfSent(call: number): string | undefined {
    const headers = fetchMock.mock.calls[call]?.[1]?.headers as Record<string, string> | undefined;
    return headers?.['X-CSRF-Token'];
}

beforeEach(() => {
    fetchMock.mockReset();
    setCsrfToken(null);
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    setCsrfToken(null);
});

describe('api client', () => {
    it('first POST fetches csrf then sends X-CSRF-Token', async () => {
        fetchMock
            .mockResolvedValueOnce(reply({ body: { token: 't1' } }))
            .mockResolvedValueOnce(reply({ body: { ok: 1 } }));
        await expect(api('POST', '/api/v1/quizzes', { a: 1 })).resolves.toEqual({ ok: 1 });
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/auth/csrf');
        expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/quizzes');
        expect(csrfSent(1)).toBe('t1');
        expect(fetchMock.mock.calls[1]?.[1]?.credentials).toBe('same-origin');
    });

    it('GET sends no csrf token and 204 resolves to undefined', async () => {
        fetchMock.mockResolvedValueOnce(reply({ status: 204 }));
        await expect(api('GET', '/api/v1/x')).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(csrfSent(0)).toBeUndefined();
    });

    it('login stores rotated token from response header', async () => {
        setCsrfToken('old');
        fetchMock
            .mockResolvedValueOnce(reply({ body: { id: 'u', email: 'a@b.c' }, headers: { 'X-CSRF-Token': 'rotated' } }))
            .mockResolvedValueOnce(reply({ status: 204 }));
        await authApi.login({ email: 'a@b.c', password: 'password1' });
        expect(csrfSent(0)).toBe('old');
        await api('POST', '/api/v1/x');
        expect(csrfSent(1)).toBe('rotated');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('logout clears token; next POST fetches csrf again', async () => {
        setCsrfToken('t1');
        fetchMock
            .mockResolvedValueOnce(reply({ status: 204 }))
            .mockResolvedValueOnce(reply({ body: { token: 't2' } }))
            .mockResolvedValueOnce(reply({ status: 204 }));
        await authApi.logout();
        await api('POST', '/api/v1/x');
        expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/auth/csrf');
        expect(csrfSent(2)).toBe('t2');
    });

    it('CSRF_INVALID retries once with fresh token', async () => {
        setCsrfToken('stale');
        fetchMock
            .mockResolvedValueOnce(reply({ status: 403, body: { code: 'CSRF_INVALID' } }))
            .mockResolvedValueOnce(reply({ body: { token: 'fresh' } }))
            .mockResolvedValueOnce(reply({ body: { done: true } }));
        await expect(api('PUT', '/api/v1/quizzes/1', { a: 1 })).resolves.toEqual({ done: true });
        expect(csrfSent(0)).toBe('stale');
        expect(csrfSent(2)).toBe('fresh');
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('second CSRF_INVALID surfaces as ApiError', async () => {
        setCsrfToken('stale');
        fetchMock
            .mockResolvedValueOnce(reply({ status: 403, body: { code: 'CSRF_INVALID' } }))
            .mockResolvedValueOnce(reply({ body: { token: 'fresh' } }))
            .mockResolvedValueOnce(reply({ status: 403, body: { code: 'CSRF_INVALID' } }));
        await expect(api('POST', '/api/v1/x')).rejects.toMatchObject({ status: 403, code: 'CSRF_INVALID' });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('error body maps to ApiError code and gameId', async () => {
        setCsrfToken('t');
        fetchMock.mockResolvedValueOnce(reply({ status: 409, body: { code: 'ACTIVE_GAME_EXISTS', gameId: 'g-1' } }));
        const err = await api('POST', '/api/v1/games').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err).toMatchObject({ status: 409, code: 'ACTIVE_GAME_EXISTS', gameId: 'g-1' });
    });

    it('non-JSON or unknown-code body becomes INTERNAL_ERROR', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }))
            .mockResolvedValueOnce(reply({ status: 500, body: { code: 'WHATEVER' } }));
        await expect(api('GET', '/api/v1/x')).rejects.toMatchObject({ status: 502, code: 'INTERNAL_ERROR' });
        await expect(api('GET', '/api/v1/x')).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
    });

    it('UNAUTHENTICATED notifies subscribers', async () => {
        const cb = vi.fn();
        const off = onUnauthenticated(cb);
        fetchMock.mockResolvedValue(reply({ status: 401, body: { code: 'UNAUTHENTICATED' } }));
        await expect(api('GET', '/api/v1/quizzes')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
        expect(cb).toHaveBeenCalledTimes(1);
        off();
        await api('GET', '/api/v1/quizzes').catch(() => undefined);
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it('INVALID_CREDENTIALS does not notify as session loss', async () => {
        const cb = vi.fn();
        const off = onUnauthenticated(cb);
        setCsrfToken('t');
        fetchMock.mockResolvedValueOnce(reply({ status: 401, body: { code: 'INVALID_CREDENTIALS' } }));
        await expect(authApi.login({ email: 'a@b.c', password: 'x' })).rejects.toMatchObject({
            code: 'INVALID_CREDENTIALS',
        });
        expect(cb).not.toHaveBeenCalled();
        off();
    });
});
