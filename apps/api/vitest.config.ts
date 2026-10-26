import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC is required: Nest relies on decorator metadata, which esbuild (Vitest default) does not emit.
export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        testTimeout: 120_000,
        hookTimeout: 180_000,
        // Every file starts its own Postgres/Redis/MinIO; more parallel files make Docker miss its port-binding timeout.
        maxWorkers: 3,
    },
    plugins: [
        swc.vite({
            module: { type: 'es6' },
            jsc: {
                target: 'es2023',
                parser: { syntax: 'typescript', decorators: true },
                transform: { legacyDecorator: true, decoratorMetadata: true },
            },
        }),
    ],
});
