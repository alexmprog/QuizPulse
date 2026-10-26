import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { CLIENT_EVENTS, ERROR_CODES, SERVER_EVENTS } from '../src/index.js';

interface AsyncApiDocument {
    components: { messages: Record<string, { name: string }>; schemas: { ErrorCode: { enum: string[] } } };
}

interface OpenApiDocument {
    components: { schemas: { ErrorCode: { enum: string[] } } };
}

const readContract = (name: string): unknown =>
    parse(readFileSync(fileURLToPath(new URL(`../../../contracts/${name}`, import.meta.url)), 'utf8'));

describe('asyncapi contract', () => {
    it('asyncapi message names equal CLIENT_EVENTS ∪ SERVER_EVENTS', () => {
        const doc = readContract('asyncapi.yaml') as AsyncApiDocument;
        const names = Object.values(doc.components.messages)
            .map((m) => m.name)
            .sort();
        expect(names).toEqual([...CLIENT_EVENTS, ...SERVER_EVENTS].sort());
    });

    it('the ErrorCode enums of openapi.yaml and asyncapi.yaml equal ERROR_CODES', () => {
        const openapi = (readContract('openapi.yaml') as OpenApiDocument).components.schemas.ErrorCode.enum;
        const asyncapi = (readContract('asyncapi.yaml') as AsyncApiDocument).components.schemas.ErrorCode.enum;
        expect(openapi).toEqual([...ERROR_CODES]);
        expect(asyncapi).toEqual([...ERROR_CODES]);
    });
});
