import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            '**/generated.ts',
            '**/dist/**',
            '**/node_modules/**',
            'apps/api/src/db/migrations/**',
            'apps/web/test-results/**',
            'apps/web/playwright-report/**',
        ],
    },
    eslint.configs.recommended,
    tseslint.configs.strictTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['eslint.config.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        files: ['apps/web/**/*.{ts,tsx}'],
        extends: [reactHooks.configs.flat.recommended],
    },
    {
        files: ['**/*.mjs'],
        extends: [tseslint.configs.disableTypeChecked],
    },
    {
        // Plain Node scripts without a build step.
        files: ['tools/**/*.mjs'],
        languageOptions: {
            globals: {
                console: 'readonly',
                process: 'readonly',
                fetch: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                URL: 'readonly',
            },
        },
    },
);
