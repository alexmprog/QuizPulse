/** Minimal XMLHttpRequest stand-in: tests drive progress and the outcome by hand. */
export class FakeXhr {
    static instances: FakeXhr[] = [];
    method = '';
    url = '';
    headers: Record<string, string> = {};
    body: unknown = null;
    status = 0;
    responseText = '';
    aborted = false;
    withCredentials = false;
    upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
        onprogress: null,
    };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;

    constructor() {
        FakeXhr.instances.push(this);
    }
    open(method: string, url: string): void {
        this.method = method;
        this.url = url;
    }
    setRequestHeader(name: string, value: string): void {
        this.headers[name] = value;
    }
    send(body: unknown): void {
        this.body = body;
    }
    abort(): void {
        this.aborted = true;
        this.onabort?.();
    }
    progress(loaded: number, total: number): void {
        this.upload.onprogress?.({ lengthComputable: true, loaded, total });
    }
    respond(status: number, body: unknown): void {
        this.status = status;
        this.responseText = JSON.stringify(body);
        this.onload?.();
    }
    fail(): void {
        this.onerror?.();
    }
    static reset(): void {
        FakeXhr.instances = [];
    }
    /** Waits until the upload has reached `send` (the CSRF token is fetched asynchronously first). */
    static async latest(): Promise<FakeXhr> {
        for (let i = 0; i < 50; i++) {
            const x = FakeXhr.instances.at(-1);
            if (x?.body) return x;
            await new Promise((r) => setTimeout(r, 0));
        }
        throw new Error('no upload started');
    }
}
