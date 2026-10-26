import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/config.js';
import { createTestApp } from './support/app.js';

describe('health', () => {
    let ctx: Awaited<ReturnType<typeof createTestApp>>;

    beforeAll(async () => {
        ctx = await createTestApp();
    });
    afterAll(async () => {
        await ctx.close();
    });

    it('GET /healthz returns 200 {status:"ok"}', async () => {
        const res = await fetch(`${ctx.url}/healthz`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok' });
    });

    it('returns {code:"NOT_FOUND"} for unknown routes', async () => {
        const res = await fetch(`${ctx.url}/nope`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: 'NOT_FOUND' });
    });

    it('does not reject undocumented /api/v1 paths in the validator', async () => {
        const res = await fetch(`${ctx.url}/api/v1/not-implemented-yet`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: 'NOT_FOUND' });
    });
});

describe('loadConfig', () => {
    const valid = {
        PUBLIC_BASE_URL: 'http://localhost:8080',
        DATABASE_URL: 'postgres://u:p@localhost:5432/db',
        REDIS_URL: 'redis://localhost:6379',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_ACCESS_KEY: 'key',
        S3_SECRET_KEY: 'secret',
        SESSION_SECRET: 'session-secret-session-secret-32ch',
        CSRF_SECRET: 'csrf-secret-csrf-secret-csrf-32ch',
    };

    it('applies defaults', () => {
        const config = loadConfig(valid);
        expect(config.port).toBe(3000);
        expect(config.s3.bucket).toBe('quizpulse-images');
        expect(config.cookieSecure).toBe(false);
        expect(config.validateResponses).toBe(false);
    });

    it('rejects missing PUBLIC_BASE_URL', () => {
        const env: NodeJS.ProcessEnv = { ...valid };
        delete env.PUBLIC_BASE_URL;
        expect(() => loadConfig(env)).toThrow(/PUBLIC_BASE_URL/);
    });
});
