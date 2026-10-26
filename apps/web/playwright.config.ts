import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running stack (`docker compose up -d`, web on :8080). The host runs in desktop
 * Chromium; players get their own contexts with phone descriptors inside the same test (see `e2e/support.ts`).
 */
export default defineConfig({
    testDir: 'e2e',
    testMatch: '*.e2e.ts',
    workers: 1,
    fullyParallel: false,
    retries: 0,
    timeout: 120_000,
    expect: { timeout: 15_000 },
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:8080',
        locale: 'ru-RU',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], locale: 'ru-RU' } }],
});
