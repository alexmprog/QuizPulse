import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IMAGE_MAX_BYTES } from '@quizpulse/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from '../../../api/client';
import { I18nProvider } from '../../../i18n/i18n';
import { FakeXhr } from '../../../test/fakeXhr';
import { ImageField } from './ImageField';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function pick(name: string, type: string, size = 10): File {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
}

function setup(imageUrl: string | null = null) {
    const onChange = vi.fn();
    render(
        <I18nProvider initial="en">
            <ImageField imageUrl={imageUrl} onChange={onChange} />
        </I18nProvider>,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('no file input');
    return { onChange, input };
}

describe('ImageField', () => {
    beforeEach(() => {
        FakeXhr.reset();
        setCsrfToken(null);
        vi.stubGlobal('XMLHttpRequest', FakeXhr);
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ token: 't' }))));
    });
    afterEach(() => {
        fetchMock.mockReset();
        vi.unstubAllGlobals();
    });

    it('shows the empty drop zone with the hint', () => {
        setup();
        expect(screen.getByText('JPEG, PNG or WebP, up to 5 MB')).toBeInTheDocument();
    });

    it('shows oversize error without network request', async () => {
        const { input, onChange } = setup();
        await userEvent.upload(input, pick('big.png', 'image/png', IMAGE_MAX_BYTES + 1));
        expect(screen.getByRole('alert')).toHaveTextContent('The file is 5.0 MB, the limit is 5 MB.');
        expect(FakeXhr.instances).toHaveLength(0);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('rejects an unsupported format without network request', async () => {
        const { input } = setup();
        await userEvent.upload(input, pick('a.gif', 'image/gif'), { applyAccept: false });
        expect(screen.getByRole('alert')).toHaveTextContent('GIF');
        expect(FakeXhr.instances).toHaveLength(0);
    });

    it('shows progress, then success calls onChange with imageId', async () => {
        const { input, onChange } = setup();
        await userEvent.upload(input, pick('ok.png', 'image/png', 4_300_000));
        const xhr = await FakeXhr.latest();
        xhr.progress(2_700_000, 4_300_000);
        expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '63');
        expect(screen.getByText('2.6 / 4.1 MB')).toBeInTheDocument();
        xhr.respond(201, { id: 'img-1', url: '/api/v1/images/img-1' });
        await waitFor(() => {
            expect(onChange).toHaveBeenCalledWith({ imageId: 'img-1', imageUrl: '/api/v1/images/img-1' });
        });
    });

    it('cancel aborts the request and leaves the field empty', async () => {
        const { input, onChange } = setup();
        await userEvent.upload(input, pick('ok.png', 'image/png'));
        const xhr = await FakeXhr.latest();
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(xhr.aborted).toBe(true);
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByText('JPEG, PNG or WebP, up to 5 MB')).toBeInTheDocument();
    });

    it('network error offers retry and remove', async () => {
        const { input, onChange } = setup();
        await userEvent.upload(input, pick('ok.png', 'image/png'));
        (await FakeXhr.latest()).fail();
        expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        expect(screen.getByText('ok.png')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => {
            expect(FakeXhr.instances).toHaveLength(2);
        });
        (await FakeXhr.latest()).respond(201, { id: 'img-2', url: '/api/v1/images/img-2' });
        await waitFor(() => {
            expect(onChange).toHaveBeenCalledWith({ imageId: 'img-2', imageUrl: '/api/v1/images/img-2' });
        });
    });

    it('remove after a failure clears the image', async () => {
        const { input, onChange } = setup();
        await userEvent.upload(input, pick('ok.png', 'image/png'));
        (await FakeXhr.latest()).fail();
        await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
        expect(onChange).toHaveBeenCalledWith(null);
        expect(screen.getByText('JPEG, PNG or WebP, up to 5 MB')).toBeInTheDocument();
    });

    it('a failed replacement leaves the question without an image', async () => {
        const { input, onChange } = setup('/api/v1/images/old');
        await userEvent.upload(input, pick('new.png', 'image/png'));
        (await FakeXhr.latest()).fail();
        await waitFor(() => {
            expect(onChange).toHaveBeenCalledWith(null);
        });
        expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('shows the preview with replace and remove when filled', async () => {
        const { onChange } = setup('/api/v1/images/abc');
        expect(screen.getByRole('img')).toHaveAttribute('src', '/api/v1/images/abc');
        expect(screen.getByText('Shown on the big screen only')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
        expect(onChange).toHaveBeenCalledWith(null);
    });

    it.each([
        [413, 'IMAGE_TOO_LARGE', 'The image is too large.'],
        [415, 'IMAGE_TYPE_UNSUPPORTED', 'This image format is not supported.'],
    ])('a server %i shows its own text, no Retry, but Remove', async (status, code, text) => {
        const { input } = setup();
        await userEvent.upload(input, pick('ok.png', 'image/png'));
        (await FakeXhr.latest()).respond(status, { code });
        expect(await screen.findByText(text)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        expect(screen.queryByText(/no connection/)).not.toBeInTheDocument();
    });

    it('offers Retry after a 5xx', async () => {
        const { input } = setup();
        await userEvent.upload(input, pick('ok.png', 'image/png'));
        (await FakeXhr.latest()).respond(500, { code: 'INTERNAL_ERROR' });
        expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('keeps the attached picture visible when a new file is rejected', async () => {
        const { input } = setup('/api/v1/images/abc');
        await userEvent.upload(input, pick('big.png', 'image/png', IMAGE_MAX_BYTES + 1));
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('img')).toHaveAttribute('src', '/api/v1/images/abc');
        expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    });
});
