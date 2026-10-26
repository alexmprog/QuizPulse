import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../src/index.js';

describe('protocol', () => {
    it('exposes protocol version 1', () => {
        expect(PROTOCOL_VERSION).toBe(1);
    });
});
