import type { IMAGE_MIME_TYPES } from '@quizpulse/protocol';

export type ImageMime = (typeof IMAGE_MIME_TYPES)[number];

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
    signature.every((byte, i) => bytes[offset + i] === byte);

/** Detects JPEG, PNG and WebP by file signature; the client-supplied MIME type is never trusted. */
export function sniffImageType(bytes: Uint8Array): ImageMime | null {
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (startsWith(bytes, PNG)) return 'image/png';
    // RIFF....WEBP
    if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
        return 'image/webp';
    }
    return null;
}
