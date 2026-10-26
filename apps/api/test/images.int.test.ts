import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IMAGE_MAX_BYTES } from '@quizpulse/protocol';
import { createTestApp, type TestApp } from './support/app.js';
import { registerHost } from './support/hosts.js';
import { TestClient } from './support/http-client.js';
import { PNG_BYTES } from './support/quiz-fixtures.js';

describe('images', () => {
    let ctx: TestApp;

    beforeAll(async () => {
        ctx = await createTestApp();
    });
    afterAll(async () => {
        await ctx.close();
    });

    function upload(host: TestClient | null, bytes: Buffer, filename: string, type = 'image/png'): Promise<Response> {
        const form = new FormData();
        form.set('file', new Blob([new Uint8Array(bytes)], { type }), filename);
        const headers: Record<string, string> = {};
        if (host) {
            headers.cookie = [...host.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
            headers['x-csrf-token'] = host.csrfToken ?? '';
        }
        return fetch(`${ctx.url}/api/v1/images`, { method: 'POST', headers, body: form });
    }

    it('upload png returns id and url and GET returns same bytes', async () => {
        const host = await registerHost(ctx.url);
        const res = await upload(host, PNG_BYTES, 'pixel.png');
        expect(res.status).toBe(201);
        const { id, url } = (await res.json()) as { id: string; url: string };
        expect(url).toBe(`/api/v1/images/${id}`);

        const got = await fetch(`${ctx.url}${url}`);
        expect(got.status).toBe(200);
        expect(got.headers.get('content-type')).toBe('image/png');
        expect(Buffer.from(await got.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
    });

    it('webp and jpeg are accepted by signature', async () => {
        const host = await registerHost(ctx.url);
        const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
        const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
        const w = await upload(host, webp, 'a.webp', 'application/octet-stream');
        const j = await upload(host, jpeg, 'a.jpg', 'application/octet-stream');
        expect(w.status).toBe(201);
        expect(j.status).toBe(201);
        const { url } = (await j.json()) as { url: string };
        expect((await fetch(`${ctx.url}${url}`)).headers.get('content-type')).toBe('image/jpeg');
    });

    it('text file renamed .png -> 415 IMAGE_TYPE_UNSUPPORTED', async () => {
        const host = await registerHost(ctx.url);
        const res = await upload(host, Buffer.from('definitely not an image'), 'fake.png');
        expect(res.status).toBe(415);
        expect(await res.json()).toEqual({ code: 'IMAGE_TYPE_UNSUPPORTED' });
    });

    it('6 MB -> 413 IMAGE_TOO_LARGE', async () => {
        const host = await registerHost(ctx.url);
        const big = Buffer.concat([PNG_BYTES, Buffer.alloc(IMAGE_MAX_BYTES + 1024 * 1024)]);
        const res = await upload(host, big, 'big.png');
        expect(res.status).toBe(413);
        expect(await res.json()).toEqual({ code: 'IMAGE_TOO_LARGE' });
    });

    it('unauthenticated upload -> 401', async () => {
        const anonymous = new TestClient(ctx.url);
        await anonymous.fetchCsrf();
        const res = await upload(anonymous, PNG_BYTES, 'pixel.png');
        expect(res.status).toBe(401);
    });

    it('unknown image id -> 404', async () => {
        const res = await fetch(`${ctx.url}/api/v1/images/00000000-0000-4000-8000-000000000000`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: 'NOT_FOUND' });
    });
});
