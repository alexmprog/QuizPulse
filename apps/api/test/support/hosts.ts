import { expect } from 'vitest';
import { TestClient } from './http-client.js';

let counter = 0;

/** Registers a fresh host (unique email) and returns a client holding its session and CSRF token. */
export async function registerHost(baseUrl: string, prefix = 'host'): Promise<TestClient> {
    counter += 1;
    const client = new TestClient(baseUrl);
    await client.fetchCsrf();
    const res = await client.request('POST', '/api/v1/auth/register', {
        body: { email: `${prefix}-${String(counter)}@example.com`, password: 'correct horse battery' },
    });
    expect(res.status).toBe(201);
    return client;
}
