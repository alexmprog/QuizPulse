import type { ClientToServerEvents, ServerToClientEvents } from '@quizpulse/protocol';
import { io, type Socket } from 'socket.io-client';
import type { TestClient } from './http-client.js';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type StateEvent = 'host:state' | 'player:state';
type StateOf<T extends StateEvent> = Parameters<ServerToClientEvents[T]>[0];

const WAIT_MS = 10_000;

function connect(url: string, headers: Record<string, string>): Promise<TypedSocket> {
    const socket: TypedSocket = io(`${url}/game`, {
        transports: ['websocket'],
        extraHeaders: headers,
        forceNew: true,
        reconnection: false,
    });
    return new Promise((resolve, reject) => {
        socket.once('connect', () => {
            resolve(socket);
        });
        socket.once('connect_error', (error) => {
            socket.close();
            reject(error);
        });
    });
}

/** The `Cookie` header carrying a test client's session. */
export function cookieOf(client: TestClient): string {
    return [...client.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

/** Connects to `/game` with the host's session cookie (the handshake authenticates the host). */
export function connectHost(url: string, cookie: string): Promise<TypedSocket> {
    return connect(url, { cookie });
}

/** Connects to `/game` without a session, as a player's browser does. */
export function connectPlayer(url: string): Promise<TypedSocket> {
    return connect(url, {});
}

/** Connects to `/game` with arbitrary handshake headers (e.g. `Origin`, `Host`, `X-Forwarded-Host`). */
export function connectWithHeaders(url: string, headers: Record<string, string>): Promise<TypedSocket> {
    return connect(url, headers);
}

/** Resolves with the next `ev` snapshot that satisfies `pred`; register it before triggering the change. */
export function nextState<T extends StateEvent>(
    s: TypedSocket,
    ev: T,
    pred: (v: StateOf<T>) => boolean = () => true,
): Promise<StateOf<T>> {
    return new Promise((resolve, reject) => {
        // Generic over the event name, so the untyped socket API is used.
        const socket = s as unknown as Socket;
        const name: string = ev;
        const listener = (v: StateOf<T>) => {
            if (!pred(v)) return;
            clearTimeout(timer);
            socket.off(name, listener);
            resolve(v);
        };
        const timer = setTimeout(() => {
            socket.off(name, listener);
            reject(new Error(`no matching ${ev} within ${String(WAIT_MS)} ms`));
        }, WAIT_MS);
        socket.on(name, listener);
    });
}

/** Resolves when the server disconnects `s`. */
export function disconnected(s: TypedSocket): Promise<void> {
    return new Promise((resolve) => {
        if (s.disconnected) resolve();
        else
            s.once('disconnect', () => {
                resolve();
            });
    });
}
