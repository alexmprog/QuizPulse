import type { ClientToServerEvents, ErrorCode, ServerToClientEvents } from '@quizpulse/protocol';
import { io, type Socket } from 'socket.io-client';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** How long an ack may take before the call counts as failed. */
export const ACK_TIMEOUT_MS = 8000;

/** The ack an event's server handler answers with: `{ ok: true, ...fields }` or `{ ok: false, code }`. */
export type AckResult<E extends keyof ClientToServerEvents> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];

/**
 * Socket for the `/game` namespace on the page's own origin. The handshake carries the session cookie, so a
 * host socket must be created after sign-in (the server reads the host identity only at the handshake).
 */
export function createGameSocket(): GameSocket {
    return io('/game', { path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
}

type LooseEmitter = { emit: (event: string, payload: unknown, ack: (res: unknown) => void) => unknown };

/**
 * Emits a client event and resolves with its ack. No ack within `timeoutMs` resolves as `INTERNAL_ERROR`;
 * an ack that still comes later goes to `onLate` (and is ignored without it). Never rejects.
 */
export function emitAck<E extends keyof ClientToServerEvents>(
    s: GameSocket,
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
    timeoutMs = ACK_TIMEOUT_MS,
    onLate?: (res: AckResult<E>) => void,
): Promise<AckResult<E>> {
    return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            settled = true;
            resolve({ ok: false, code: 'INTERNAL_ERROR' } as AckResult<E>);
        }, timeoutMs);
        (s as unknown as LooseEmitter).emit(event, payload, (res) => {
            if (settled) {
                onLate?.(res as AckResult<E>);
                return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(res as AckResult<E>);
        });
    });
}

/** Join answers worth asking again: the server was busy or failed, not a refusal. Timeouts count as INTERNAL_ERROR. */
export const TRANSIENT_CODES: readonly ErrorCode[] = ['INTERNAL_ERROR', 'RATE_LIMITED'];

export const RETRY_BASE_MS = 1500;
const RETRY_MAX_MS = 10_000;

/** Delay before retry number `attempt` (0-based): 1.5 s, 3 s, 6 s, then 10 s. */
export function retryDelay(attempt: number): number {
    return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
}
