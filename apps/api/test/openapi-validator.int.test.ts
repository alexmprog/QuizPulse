import { Controller, Get, HttpException, Logger, Query } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from './support/app.js';
import { TestClient } from './support/http-client.js';

// Stands in for the real packs controller (a later task): the shapes it returns are what the contract is checked against.
@Controller('api/v1/packs')
class StubPacksController {
    @Get()
    list(@Query('language') language?: string): object {
        return language === 'en' ? { nope: true } : [];
    }
}

@Controller('api/v1/stub-teapot')
class StubTeapotController {
    @Get()
    brew(): never {
        throw new HttpException('short and stout', 418);
    }
}

describe('OpenAPI validator', () => {
    let ctx: TestApp;
    let client: TestClient;

    beforeAll(async () => {
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined); // the contract-violation case logs an expected error
        ctx = await createTestApp({ controllers: [StubPacksController, StubTeapotController] });
        client = new TestClient(ctx.url);
        await client.fetchCsrf();
    });
    afterAll(async () => {
        await ctx.close();
    });

    it('rejects an invalid query with 400 INVALID_PAYLOAD', async () => {
        const res = await client.request('GET', '/api/v1/packs?language=fr');
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ code: 'INVALID_PAYLOAD' });
    });

    it('rejects an invalid request body with 400 INVALID_PAYLOAD', async () => {
        const res = await client.request('POST', '/api/v1/auth/login', {
            body: { email: 'not-an-email', password: 'short' },
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ code: 'INVALID_PAYLOAD' });
    });

    it('lets a valid request through', async () => {
        const res = await client.request('GET', '/api/v1/packs?language=ru');
        expect(res.status).toBe(200);
    });

    it('answers a response that violates the contract with 500 INTERNAL_ERROR', async () => {
        const res = await client.request('GET', '/api/v1/packs?language=en');
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ code: 'INTERNAL_ERROR' });
    });

    it('keeps 415 as IMAGE_TYPE_UNSUPPORTED for an unsupported media type', async () => {
        const res = await client.request('POST', '/api/v1/images', {
            body: 'plain',
            headers: { 'content-type': 'text/plain' },
        });
        expect(res.status).toBe(415);
        expect(await res.json()).toEqual({ code: 'IMAGE_TYPE_UNSUPPORTED' });
    });

    it('keeps 413 as IMAGE_TOO_LARGE for an oversized body on an images route', async () => {
        const res = await client.request('POST', '/api/v1/images', {
            body: JSON.stringify({ email: 'a@example.com', password: 'x'.repeat(200_000) }),
        });
        expect(res.status).toBe(413);
        expect(await res.json()).toEqual({ code: 'IMAGE_TOO_LARGE' });
    });

    it('keeps 413 and 415 statuses with INVALID_PAYLOAD outside the images routes', async () => {
        const large = await client.request('POST', '/api/v1/auth/login', {
            body: JSON.stringify({ email: 'a@example.com', password: 'x'.repeat(200_000) }),
        });
        expect(large.status).toBe(413);
        expect(await large.json()).toEqual({ code: 'INVALID_PAYLOAD' });
        const text = await client.request('POST', '/api/v1/auth/login', {
            body: 'plain',
            headers: { 'content-type': 'text/plain' },
        });
        expect(text.status).toBe(415);
        expect(await text.json()).toEqual({ code: 'INVALID_PAYLOAD' });
    });

    it('keeps the real status of a 4xx thrown outside the validator (unknown route -> 404 NOT_FOUND)', async () => {
        const res = await client.request('GET', '/api/v1/nowhere');
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: 'NOT_FOUND' });
    });

    it('keeps the real status of any 4xx HttpException, mapping unknown ones to INVALID_PAYLOAD', async () => {
        const res = await client.request('GET', '/api/v1/stub-teapot');
        expect(res.status).toBe(418);
        expect(await res.json()).toEqual({ code: 'INVALID_PAYLOAD' });
    });
});
