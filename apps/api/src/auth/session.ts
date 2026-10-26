import { type IncomingMessage, ServerResponse } from 'node:http';
import type { Request, RequestHandler } from 'express';
import session, { type SessionData } from 'express-session';
import { RedisStore } from 'connect-redis';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../config/config.js';

declare module 'express-session' {
    interface SessionData {
        hostId?: string;
        /** Marker that pins an anonymous session so a CSRF token can be bound to its id. */
        csrf?: true;
    }
}

export const SESSION_COOKIE = 'qp_session';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Anonymous sessions only carry a CSRF binding, so they expire from Redis quickly. */
export const ANONYMOUS_SESSION_TTL_SECONDS = 60 * 60;
export const SESSION_MIDDLEWARE = Symbol('SESSION_MIDDLEWARE');

/** Adapts ioredis to the node-redis call shapes connect-redis uses. */
function storeClient(redis: Redis): object {
    return {
        get: (key: string) => redis.get(key),
        set: (key: string, value: string, options?: { expiration: { value: number } }) =>
            options ? redis.set(key, value, 'EX', options.expiration.value) : redis.set(key, value),
        expire: (key: string, seconds: number) => redis.expire(key, seconds),
        del: (keys: string[]) => redis.del(...keys),
    };
}

/** express-session backed by Redis: cookie `qp_session`, HttpOnly, SameSite=Lax, 30 days. */
export function sessionMiddleware(config: AppConfig, redis: Redis): RequestHandler {
    return session({
        name: SESSION_COOKIE,
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        store: new RedisStore({
            client: storeClient(redis),
            prefix: 'qp:sess:',
            ttl: (sess) => (sess.hostId ? SESSION_TTL_SECONDS : ANONYMOUS_SESSION_TTL_SECONDS),
        }),
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: config.cookieSecure,
            maxAge: SESSION_TTL_SECONDS * 1000,
        },
    });
}

export function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error('session error', { cause: error });
}

/** Runs a callback-style express-session call (`save`, `regenerate`, `destroy`) as a promise. */
export function promisified(fn: (callback: (error?: unknown) => void) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        fn((error) => {
            if (error) reject(toError(error));
            else resolve();
        });
    });
}

/**
 * Loads the session behind a raw request (e.g. a Socket.io handshake) by running the same middleware Express uses.
 * Resolves `null` when the request carries no valid logged-in session.
 */
export function sessionFromRequest(middleware: RequestHandler, req: IncomingMessage): Promise<SessionData | null> {
    return new Promise((resolve, reject) => {
        const request = req as Request;
        const response = new ServerResponse(req);
        middleware(request, response as never, (error?: unknown) => {
            if (error) reject(toError(error));
            else resolve(request.session.hostId ? request.session : null);
        });
    });
}

/** Convenience over `sessionFromRequest`: the logged-in host id of a raw request, or `null`. */
export async function hostIdFromSession(middleware: RequestHandler, req: IncomingMessage): Promise<string | null> {
    return (await sessionFromRequest(middleware, req))?.hostId ?? null;
}
