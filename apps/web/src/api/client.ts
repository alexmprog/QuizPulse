import { ERROR_CODES, type ErrorCode } from '@quizpulse/protocol';
import type { components } from '@quizpulse/api-types';

export type Schemas = components['schemas'];

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

const CSRF_HEADER = 'X-CSRF-Token';

export class ApiError extends Error {
    readonly status: number;
    readonly code: ErrorCode;
    readonly gameId?: string;

    constructor(status: number, code: ErrorCode, gameId?: string) {
        super(code);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.gameId = gameId;
    }
}

function isErrorCode(v: unknown): v is ErrorCode {
    return typeof v === 'string' && (ERROR_CODES as readonly string[]).includes(v);
}

/** Builds the ApiError for a response whose JSON body is already parsed (or `null` when it was not JSON). */
export function apiErrorFromBody(status: number, body: unknown): ApiError {
    const b = body as { code?: unknown; gameId?: unknown } | null;
    const code = isErrorCode(b?.code) ? b.code : 'INTERNAL_ERROR';
    return new ApiError(status, code, typeof b?.gameId === 'string' ? b.gameId : undefined);
}

async function toApiError(res: Response): Promise<ApiError> {
    try {
        return apiErrorFromBody(res.status, await res.json());
    } catch {
        return new ApiError(res.status, 'INTERNAL_ERROR');
    }
}

let token: string | null = null;
let pending: Promise<string> | null = null;

export function setCsrfToken(t: string | null): void {
    token = t;
    pending = null;
}

/** Cached CSRF token; the first call (or the first after a reset) asks the server. */
export function csrfToken(): Promise<string> {
    if (token !== null) return Promise.resolve(token);
    pending ??= (async () => {
        try {
            const res = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
            if (!res.ok) throw await toApiError(res);
            const body = (await res.json()) as { token: string };
            token = body.token;
            return body.token;
        } finally {
            pending = null;
        }
    })();
    return pending;
}

const listeners = new Set<() => void>();

/** Subscribes to "the session is gone" (a request answered 401 UNAUTHENTICATED). Returns the unsubscribe function. */
export function onUnauthenticated(cb: () => void): () => void {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

/** Tells the subscribers that the session is gone. */
export function emitUnauthenticated(): void {
    for (const cb of [...listeners]) cb();
}

/** Runs a state-changing request; on a stale CSRF token takes a fresh one and repeats it exactly once. */
export async function withCsrfRetry<T>(attempt: () => Promise<T>): Promise<T> {
    try {
        return await attempt();
    } catch (e) {
        if (!(e instanceof ApiError) || e.code !== 'CSRF_INVALID') throw e;
        setCsrfToken(null);
        return attempt();
    }
}

async function send(method: Method, path: string, body: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers[CSRF_HEADER] = await csrfToken();
    return fetch(path, {
        method,
        headers,
        credentials: 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

/** Like `api`, but also hands back the response headers (login and register rotate the CSRF token there). */
export async function apiResponse(
    method: Method,
    path: string,
    body?: unknown,
): Promise<{ data: unknown; headers: Headers }> {
    let res = await send(method, path, body);
    if (method !== 'GET' && res.status === 403) {
        const err = await toApiError(res.clone());
        if (err.code === 'CSRF_INVALID') {
            // Stale token (rotated session): take a fresh one and repeat the request exactly once.
            setCsrfToken(null);
            res = await send(method, path, body);
        }
    }
    if (!res.ok) {
        const err = await toApiError(res);
        if (err.code === 'UNAUTHENTICATED') emitUnauthenticated();
        throw err;
    }
    const data = res.status === 204 ? undefined : ((await res.json()) as unknown);
    return { data, headers: res.headers };
}

export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
    return (await apiResponse(method, path, body)).data as T;
}
