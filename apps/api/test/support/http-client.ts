/** Minimal cookie-keeping HTTP client; follows the CSRF protocol the real web client uses. */
export class TestClient {
    readonly cookies = new Map<string, string>();
    csrfToken: string | null = null;

    constructor(readonly baseUrl: string) {}

    async request(
        method: string,
        path: string,
        options: { body?: unknown; csrf?: boolean | string; headers?: Record<string, string> } = {},
    ): Promise<Response> {
        const headers = new Headers(options.headers);
        if (this.cookies.size > 0) {
            headers.set('cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
        }
        if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
        const csrf = options.csrf ?? true;
        if (typeof csrf === 'string') headers.set('x-csrf-token', csrf);
        else if (csrf && this.csrfToken) headers.set('x-csrf-token', this.csrfToken);
        const res = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers,
            body:
                options.body === undefined
                    ? undefined
                    : typeof options.body === 'string'
                      ? options.body
                      : JSON.stringify(options.body),
        });
        this.absorb(res);
        return res;
    }

    /** Fetches a CSRF token (and cookie) the way the web client does before its first state-changing call. */
    async fetchCsrf(): Promise<string> {
        const res = await this.request('GET', '/api/v1/auth/csrf');
        const { token } = (await res.json()) as { token: string };
        this.csrfToken = token;
        return token;
    }

    private absorb(res: Response): void {
        for (const line of res.headers.getSetCookie()) {
            const [pair = ''] = line.split(';');
            const eq = pair.indexOf('=');
            const name = pair.slice(0, eq);
            const value = pair.slice(eq + 1);
            if (/;\s*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i.test(line)) this.cookies.delete(name);
            else this.cookies.set(name, value);
        }
        // A rotated token is announced in the response header (login/register re-key the session).
        const rotated = res.headers.get('x-csrf-token');
        if (rotated) this.csrfToken = rotated;
    }
}
