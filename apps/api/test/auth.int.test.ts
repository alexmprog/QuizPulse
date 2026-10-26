import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import type { RequestHandler } from 'express';
import { SESSION_MIDDLEWARE, hostIdFromSession } from '../src/auth/session.js';
import type { Redis } from 'ioredis';
import { REDIS } from '../src/redis/redis.module.js';
import { createTestApp, type TestApp } from './support/app.js';
import { TestClient } from './support/http-client.js';

const PASSWORD = 'correct horse battery';

describe('host auth', () => {
    let ctx: TestApp;

    beforeAll(async () => {
        ctx = await createTestApp();
    });
    afterAll(async () => {
        await ctx.close();
    });

    async function registered(email: string): Promise<TestClient> {
        const client = new TestClient(ctx.url);
        await client.fetchCsrf();
        const res = await client.request('POST', '/api/v1/auth/register', { body: { email, password: PASSWORD } });
        expect(res.status).toBe(201);
        return client;
    }

    it('register then me returns email', async () => {
        const client = new TestClient(ctx.url);
        await client.fetchCsrf();
        const res = await client.request('POST', '/api/v1/auth/register', {
            body: { email: 'alice@example.com', password: PASSWORD },
        });
        expect(res.status).toBe(201);
        const created = (await res.json()) as { id: string; email: string };
        expect(created.email).toBe('alice@example.com');

        const me = await client.request('GET', '/api/v1/auth/me');
        expect(me.status).toBe(200);
        expect(await me.json()).toEqual({ id: created.id, email: 'alice@example.com' });
    });

    it('register duplicate email (different case) -> 409 EMAIL_TAKEN', async () => {
        await registered('bob@example.com');
        const other = new TestClient(ctx.url);
        await other.fetchCsrf();
        const res = await other.request('POST', '/api/v1/auth/register', {
            body: { email: 'BOB@Example.COM', password: PASSWORD },
        });
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ code: 'EMAIL_TAKEN' });
    });

    it('login wrong password and unknown email both -> 401 INVALID_CREDENTIALS', async () => {
        await registered('carol@example.com');
        const client = new TestClient(ctx.url);
        await client.fetchCsrf();
        const wrong = await client.request('POST', '/api/v1/auth/login', {
            body: { email: 'carol@example.com', password: 'not the password' },
        });
        const unknown = await client.request('POST', '/api/v1/auth/login', {
            body: { email: 'nobody@example.com', password: PASSWORD },
        });
        expect(wrong.status).toBe(401);
        expect(unknown.status).toBe(401);
        expect(await wrong.json()).toEqual({ code: 'INVALID_CREDENTIALS' });
        expect(await unknown.json()).toEqual({ code: 'INVALID_CREDENTIALS' });
    });

    it('login with the right password (any email case) opens a session', async () => {
        await registered('dave@example.com');
        const client = new TestClient(ctx.url);
        await client.fetchCsrf();
        const res = await client.request('POST', '/api/v1/auth/login', {
            body: { email: 'DAVE@example.com', password: PASSWORD },
        });
        expect(res.status).toBe(200);
        const me = await client.request('GET', '/api/v1/auth/me');
        expect(me.status).toBe(200);
    });

    it('logout then me -> 401', async () => {
        const client = await registered('erin@example.com');
        const out = await client.request('POST', '/api/v1/auth/logout');
        expect(out.status).toBe(204);
        const me = await client.request('GET', '/api/v1/auth/me');
        expect(me.status).toBe(401);
        expect(await me.json()).toEqual({ code: 'UNAUTHENTICATED' });
    });

    it('me and logout without a session -> 401 UNAUTHENTICATED', async () => {
        const client = new TestClient(ctx.url);
        await client.fetchCsrf();
        expect((await client.request('GET', '/api/v1/auth/me')).status).toBe(401);
        const out = await client.request('POST', '/api/v1/auth/logout');
        expect(out.status).toBe(401);
        expect(await out.json()).toEqual({ code: 'UNAUTHENTICATED' });
    });

    it('POST without csrf token -> 403 CSRF_INVALID', async () => {
        const client = new TestClient(ctx.url);
        await client.fetchCsrf();
        const body = { email: 'frank@example.com', password: PASSWORD };

        const noHeader = await client.request('POST', '/api/v1/auth/register', { body, csrf: false });
        expect(noHeader.status).toBe(403);
        expect(await noHeader.json()).toEqual({ code: 'CSRF_INVALID' });

        const wrong = await client.request('POST', '/api/v1/auth/register', { body, csrf: 'forged-token' });
        expect(wrong.status).toBe(403);
        expect(await wrong.json()).toEqual({ code: 'CSRF_INVALID' });

        const bare = await fetch(`${ctx.url}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        expect(bare.status).toBe(403);
        expect(await bare.json()).toEqual({ code: 'CSRF_INVALID' });
    });

    it('session cookie is HttpOnly and SameSite=Lax, valid for 30 days', async () => {
        const client = new TestClient(ctx.url);
        await client.fetchCsrf();
        const res = await client.request('POST', '/api/v1/auth/register', {
            body: { email: 'grace@example.com', password: PASSWORD },
        });
        const cookie = res.headers.getSetCookie().find((line) => line.startsWith('qp_session='));
        expect(cookie).toBeDefined();
        expect(cookie).toMatch(/;\s*HttpOnly/i);
        expect(cookie).toMatch(/;\s*SameSite=Lax/i);
        const expires = /;\s*Expires=([^;]+)/i.exec(cookie ?? '')?.[1];
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        expect(Math.abs(Date.parse(expires ?? '') - (Date.now() + thirtyDaysMs))).toBeLessThan(60_000);
        expect(cookie).not.toMatch(/;\s*Secure/i);
    });

    it('password shorter than 8 -> 400 INVALID_PAYLOAD', async () => {
        const client = new TestClient(ctx.url);
        await client.fetchCsrf();
        const res = await client.request('POST', '/api/v1/auth/register', {
            body: { email: 'heidi@example.com', password: 'short' },
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ code: 'INVALID_PAYLOAD' });
    });

    it('hostIdFromSession resolves the host of a raw handshake request, null without a session', async () => {
        const client = await registered('ivan@example.com');
        const middleware = ctx.app.get<RequestHandler>(SESSION_MIDDLEWARE);
        const handshake = (cookie?: string): IncomingMessage => {
            const req = new IncomingMessage(new Socket());
            req.url = '/socket.io/?EIO=4&transport=polling';
            if (cookie) req.headers.cookie = cookie;
            return req;
        };
        const me = (await (await client.request('GET', '/api/v1/auth/me')).json()) as { id: string };
        const cookie = [...client.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
        expect(await hostIdFromSession(middleware, handshake(cookie))).toBe(me.id);
        expect(await hostIdFromSession(middleware, handshake())).toBeNull();
    });

    it.each(['login', 'register'] as const)(
        '%s issues a new session id and invalidates the pre-login CSRF token',
        async (action) => {
            const email = `fixation-${action}@example.com`;
            if (action === 'login') await registered(email);
            const client = new TestClient(ctx.url);
            const preLoginToken = await client.fetchCsrf();
            const before = client.cookies.get('qp_session');
            expect(before).toBeDefined();

            const res = await client.request('POST', `/api/v1/auth/${action}`, { body: { email, password: PASSWORD } });
            expect(res.status).toBe(action === 'login' ? 200 : 201);
            expect(client.cookies.get('qp_session')).not.toBe(before);
            expect(client.csrfToken).not.toBe(preLoginToken);

            const stale = await client.request('POST', '/api/v1/auth/logout', { csrf: preLoginToken });
            expect(stale.status).toBe(403);
            expect(await stale.json()).toEqual({ code: 'CSRF_INVALID' });
            expect((await client.request('POST', '/api/v1/auth/logout')).status).toBe(204);
        },
    );

    it('anonymous sessions expire within an hour, logged-in ones last 30 days', async () => {
        const anonymous = new TestClient(ctx.url);
        await anonymous.fetchCsrf();
        const redis = ctx.app.get<Redis>(REDIS);
        const anonKey = `qp:sess:${
            decodeURIComponent(anonymous.cookies.get('qp_session') ?? '')
                .slice(2)
                .split('.')[0] ?? ''
        }`;
        expect(await redis.ttl(anonKey)).toBeLessThanOrEqual(3600);
        expect(await redis.ttl(anonKey)).toBeGreaterThan(0);

        const host = await registered('judy@example.com');
        const hostKey = `qp:sess:${
            decodeURIComponent(host.cookies.get('qp_session') ?? '')
                .slice(2)
                .split('.')[0] ?? ''
        }`;
        expect(await redis.ttl(hostKey)).toBeGreaterThan(29 * 24 * 3600);
    });
});
