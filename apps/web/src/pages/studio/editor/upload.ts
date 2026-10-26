import { IMAGE_MAX_BYTES, IMAGE_MIME_TYPES } from '@quizpulse/protocol';
import { csrfToken, ApiError, apiErrorFromBody, emitUnauthenticated, withCsrfRetry } from '../../../api/client';
import { IMAGES_PATH, type ImageCreated } from '../../../api/images';

export type ImageCheck = { ok: true } | { ok: false; reason: 'size' | 'type' };

/** Client-side pre-check: the server enforces the same limits, this only saves the round trip. */
export function checkImage(f: File): ImageCheck {
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(f.type)) return { ok: false, reason: 'type' };
    if (f.size > IMAGE_MAX_BYTES) return { ok: false, reason: 'size' };
    return { ok: true };
}

export interface UploadHandle {
    promise: Promise<ImageCreated>;
    abort(): void;
}

export function uploadImage(f: File, onProgress: (loaded: number, total: number) => void): UploadHandle {
    let aborted = false;
    let current: XMLHttpRequest | null = null;
    const abortError = () => new DOMException('Upload aborted', 'AbortError');

    const attempt = async (): Promise<ImageCreated> => {
        const token = await csrfToken();
        if (aborted) throw abortError();
        return new Promise<ImageCreated>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            current = xhr;
            xhr.open('POST', IMAGES_PATH);
            xhr.withCredentials = true;
            xhr.setRequestHeader('X-CSRF-Token', token);
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) onProgress(e.loaded, e.total);
            };
            xhr.onload = () => {
                let body: unknown = null;
                try {
                    body = JSON.parse(xhr.responseText);
                } catch {
                    // not JSON: the status alone decides
                }
                if (xhr.status >= 200 && xhr.status < 300) resolve(body as ImageCreated);
                else reject(apiErrorFromBody(xhr.status, body));
            };
            xhr.onerror = () => {
                reject(new ApiError(0, 'INTERNAL_ERROR'));
            };
            xhr.onabort = () => {
                reject(abortError());
            };
            const form = new FormData();
            form.append('file', f);
            xhr.send(form);
        });
    };

    const promise = withCsrfRetry(attempt).catch((e: unknown) => {
        if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') emitUnauthenticated();
        throw e;
    });
    return {
        promise,
        abort() {
            aborted = true;
            current?.abort();
        },
    };
}
