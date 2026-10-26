import { describe, expect, it } from 'vitest';
import { safeNext } from './next';

describe('safeNext', () => {
    it('keeps a same-origin path', () => {
        expect(safeNext('/studio/history?x=1')).toBe('/studio/history?x=1');
    });

    it('falls back to /studio for missing, external and protocol-relative targets', () => {
        expect(safeNext(null)).toBe('/studio');
        expect(safeNext('https://evil.com')).toBe('/studio');
        expect(safeNext('//evil.com')).toBe('/studio');
        expect(safeNext('/\\evil.com')).toBe('/studio');
    });

    it('rejects a control character or a backslash anywhere', () => {
        expect(safeNext('/\t/evil.com')).toBe('/studio');
        // `?next=/%09/evil.com` reaches safeNext already decoded by URLSearchParams.
        expect(safeNext(new URLSearchParams('next=/%09/evil.com').get('next'))).toBe('/studio');
        expect(safeNext('/\n/evil.com')).toBe('/studio');
        expect(safeNext('/a\\b')).toBe('/studio');
        expect(safeNext('/studio\u0000')).toBe('/studio');
    });
});
