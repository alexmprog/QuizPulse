import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const api = 'http://localhost:3000';

export default defineConfig({
    plugins: [react()],
    server: {
        host: true,
        port: 5173,
        proxy: {
            '/api': api,
            '/socket.io': { target: api, ws: true },
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['src/test/setup.ts'],
    },
});
