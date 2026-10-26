import { IMAGE_MAX_BYTES } from '@quizpulse/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, setCsrfToken } from '../../../api/client';
import { FakeXhr } from '../../../test/fakeXhr';
import { checkImage, uploadImage } from './upload';

function file(type: string, size: number): File {
    const f = new File(['x'], 'pic', { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
}

describe('checkImage', () => {
    it('rejects 5 MB + 1 byte as size', () => {
        expect(checkImage(file('image/png', IMAGE_MAX_BYTES + 1))).toEqual({ ok: false, reason: 'size' });
    });
    it('rejects image/gif as type', () => {
        expect(checkImage(file('image/gif', 10))).toEqual({ ok: false, reason: 'type' });
    });
    it('accepts image/webp at exactly IMAGE_MAX_BYTES', () => {
        expect(checkImage(file('image/webp', IMAGE_MAX_BYTES))).toEqual({ ok: true });
    });
});

describe('uploadImage', () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
    beforeEach(() => {
        FakeXhr.reset();
        setCsrfToken(null);
        vi.stubGlobal('XMLHttpRequest', FakeXhr);
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ token: 'tok' }))));
    });
    afterEach(() => {
        fetchMock.mockReset();
        vi.unstubAllGlobals();
    });

    it('reports progress and resolves ImageCreated', async () => {
        const onProgress = vi.fn();
        const { promise } = uploadImage(file('image/png', 10), onProgress);
        const xhr = await FakeXhr.latest();
        expect(xhr.method).toBe('POST');
        expect(xhr.url).toBe('/api/v1/images');
        expect(xhr.headers['X-CSRF-Token']).toBe('tok');
        expect((xhr.body as FormData).get('file')).toBeInstanceOf(File);
        xhr.progress(5, 10);
        expect(onProgress).toHaveBeenCalledWith(5, 10);
        xhr.respond(201, { id: 'i1', url: '/api/v1/images/i1' });
        await expect(promise).resolves.toEqual({ id: 'i1', url: '/api/v1/images/i1' });
    });

    it('413 maps to IMAGE_TOO_LARGE', async () => {
        const { promise } = uploadImage(file('image/png', 10), vi.fn());
        (await FakeXhr.latest()).respond(413, { code: 'IMAGE_TOO_LARGE' });
        await expect(promise).rejects.toMatchObject({ status: 413, code: 'IMAGE_TOO_LARGE' });
        await expect(promise).rejects.toBeInstanceOf(ApiError);
    });

    it('415 maps to IMAGE_TYPE_UNSUPPORTED', async () => {
        const { promise } = uploadImage(file('image/png', 10), vi.fn());
        (await FakeXhr.latest()).respond(415, { code: 'IMAGE_TYPE_UNSUPPORTED' });
        await expect(promise).rejects.toMatchObject({ status: 415, code: 'IMAGE_TYPE_UNSUPPORTED' });
    });

    it('maps a network failure to INTERNAL_ERROR with status 0', async () => {
        const { promise } = uploadImage(file('image/png', 10), vi.fn());
        (await FakeXhr.latest()).fail();
        await expect(promise).rejects.toMatchObject({ status: 0, code: 'INTERNAL_ERROR' });
    });

    it('abort rejects with AbortError', async () => {
        const handle = uploadImage(file('image/png', 10), vi.fn());
        const xhr = await FakeXhr.latest();
        handle.abort();
        expect(xhr.aborted).toBe(true);
        await expect(handle.promise).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('refreshes the CSRF token once on CSRF_INVALID and repeats the upload', async () => {
        let n = 0;
        fetchMock.mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ token: `tok${String(++n)}` }))),
        );
        const { promise } = uploadImage(file('image/png', 10), vi.fn());
        (await FakeXhr.latest()).respond(403, { code: 'CSRF_INVALID' });
        await vi.waitFor(() => {
            expect(FakeXhr.instances).toHaveLength(2);
        });
        const second = await FakeXhr.latest();
        expect(second.headers['X-CSRF-Token']).toBe('tok2');
        second.respond(201, { id: 'i2', url: '/api/v1/images/i2' });
        await expect(promise).resolves.toMatchObject({ id: 'i2' });
    });

    it('does not retry a second CSRF_INVALID', async () => {
        const { promise } = uploadImage(file('image/png', 10), vi.fn());
        (await FakeXhr.latest()).respond(403, { code: 'CSRF_INVALID' });
        await vi.waitFor(() => {
            expect(FakeXhr.instances).toHaveLength(2);
        });
        (await FakeXhr.latest()).respond(403, { code: 'CSRF_INVALID' });
        await expect(promise).rejects.toMatchObject({ code: 'CSRF_INVALID' });
        expect(FakeXhr.instances).toHaveLength(2);
    });
});
