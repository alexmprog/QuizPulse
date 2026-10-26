import type { ClientToServerEvents, ServerToClientEvents } from '@quizpulse/protocol';
import type { GameSocket } from '../game/socket';

type Listener = (...args: never[]) => void;
type AckFn = (res: unknown) => void;
type Reply = unknown;

export interface Emitted {
    event: keyof ClientToServerEvents;
    payload: unknown;
    ack: AckFn | undefined;
    acked: boolean;
}

/**
 * In-memory stand-in for the `/game` socket. Tests read the emit log, answer acks by hand (`respond`) or
 * automatically (`reply`), push server events (`serverEmit`) and drive the connection (`connect`, `drop`).
 * Hand it to a hook with `socketFactory={fake.factory}`.
 */
export class FakeSocket {
    connected = false;
    /** Every client emit, oldest first. */
    readonly emitted: Emitted[] = [];
    /** How many times the code under test called `disconnect()`. */
    disconnectCalls = 0;
    private readonly listeners = new Map<string, Set<Listener>>();
    private readonly replies = new Map<string, Reply>();

    /** Socket factory for `useHostGame` / `usePlayerGame`; returns this fake. */
    readonly factory = (): GameSocket => this as unknown as GameSocket;

    on(event: string, fn: Listener): this {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(fn);
        return this;
    }

    off(event: string, fn?: Listener): this {
        if (fn) this.listeners.get(event)?.delete(fn);
        else this.listeners.delete(event);
        return this;
    }

    emit(event: keyof ClientToServerEvents, payload: unknown, ack?: AckFn): this {
        const entry: Emitted = { event, payload, ack, acked: false };
        this.emitted.push(entry);
        if (this.replies.has(event)) {
            entry.acked = true;
            ack?.(this.replies.get(event));
        }
        return this;
    }

    /** Real-API connect: marks the socket connected and fires `connect` (a no-op when already connected). */
    connect(): this {
        if (this.connected) return this;
        this.connected = true;
        this.fire('connect');
        return this;
    }

    /** Real-API disconnect, as the code under test calls it: fires `disconnect` with `io client disconnect`. */
    disconnect(): this {
        this.disconnectCalls += 1;
        this.close('io client disconnect');
        return this;
    }

    /** The connection is lost without the client asking (network drop by default, or a server-side kick). */
    drop(reason: 'transport close' | 'io server disconnect' | 'ping timeout' = 'transport close'): void {
        this.close(reason);
    }

    /** Pushes a server event to the listeners. */
    serverEmit<E extends keyof ServerToClientEvents>(event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
        this.fire(event, ...args);
    }

    /** From now on every `event` emit is acked right away with `res`. */
    reply<E extends keyof ClientToServerEvents>(event: E, res: AckOf<E>): void {
        this.replies.set(event, res);
    }

    /** Acks the oldest not yet acked `event` emit with `res`. */
    respond<E extends keyof ClientToServerEvents>(event: E, res: AckOf<E>): void {
        const entry = this.emitted.find((e) => e.event === event && !e.acked);
        if (!entry) throw new Error(`no pending ${event}`);
        entry.acked = true;
        entry.ack?.(res);
    }

    /** Emits of `event`, oldest first. */
    sent(event: keyof ClientToServerEvents): Emitted[] {
        return this.emitted.filter((e) => e.event === event);
    }

    private close(reason: string): void {
        if (!this.connected) return;
        this.connected = false;
        this.fire('disconnect', reason);
    }

    private fire(event: string, ...args: unknown[]): void {
        for (const fn of [...(this.listeners.get(event) ?? [])]) (fn as (...a: unknown[]) => void)(...args);
    }
}

/** The ack result type of a client event. */
export type AckOf<E extends keyof ClientToServerEvents> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];
