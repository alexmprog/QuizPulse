import type { ErrorCode, HostView } from '@quizpulse/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { emitUnauthenticated, onUnauthenticated } from '../api/client';
import { stampCountdowns } from './clock';
import { createGameSocket, emitAck, retryDelay, TRANSIENT_CODES, type GameSocket } from './socket';

export type Conn = 'connecting' | 'online' | 'reconnecting';

export type HostCommand = 'host:start' | 'host:next' | 'host:pause' | 'host:resume' | 'host:end';

export type HostFatal = ErrorCode | 'closed';

export interface HostGame {
    view: HostView | null;
    conn: Conn;
    /** The screen cannot go on: `host:join` was refused for good, the session is gone, or the lobby was closed. */
    fatal: HostFatal | null;
    /**
     * Resolves with the refusal code, or null on success. A call while another command or kick is in flight is
     * ignored and resolves null; while disconnected it resolves `INTERNAL_ERROR` without sending.
     */
    command: (e: HostCommand) => Promise<ErrorCode | null>;
    kick: (playerId: string) => Promise<ErrorCode | null>;
    /** A command or kick is waiting for its ack; further calls are ignored until it arrives. */
    pending: boolean;
}

const FATAL_JOIN: readonly ErrorCode[] = ['NOT_HOST', 'GAME_NOT_FOUND', 'UNAUTHENTICATED'];

/**
 * The host's connection to one game. Must be mounted only for a signed-in host: the server reads the host
 * identity at the handshake, so the socket is created here and closed on unmount and when the session ends.
 * Every `connect` (the first one and each reconnect) sends `host:join`; a transient refusal (`INTERNAL_ERROR`,
 * timeout, `RATE_LIMITED`) is retried after a backoff, `NOT_HOST`/`GAME_NOT_FOUND`/`UNAUTHENTICATED` are fatal.
 */
export function useHostGame(gameId: string, socketFactory: () => GameSocket = createGameSocket): HostGame {
    const [view, setView] = useState<HostView | null>(null);
    const [conn, setConn] = useState<Conn>('connecting');
    const [fatal, setFatal] = useState<HostFatal | null>(null);
    const [pending, setPending] = useState(false);
    const factory = useRef(socketFactory);
    const socket = useRef<GameSocket | null>(null);
    const inFlight = useRef(false);

    useEffect(() => {
        const s = factory.current();
        socket.current = s;
        let alive = true;
        // Bumped on every connect and disconnect: an ack or retry from an older connection is dropped.
        let gen = 0;
        let retry: ReturnType<typeof setTimeout> | undefined;
        const stop = (reason: HostFatal) => {
            setFatal(reason);
            s.disconnect();
        };
        const join = (g: number, attempt: number) => {
            void emitAck(s, 'host:join', { gameId }).then((res) => {
                if (!alive || g !== gen || res.ok) return;
                if (res.code === 'UNAUTHENTICATED') {
                    // The app forgets the cached `me` (RequireAuth then sends the host to /login once, instead of
                    // /login bouncing back here); the listener below stops this screen.
                    emitUnauthenticated();
                } else if (FATAL_JOIN.includes(res.code)) {
                    stop(res.code);
                } else if (TRANSIENT_CODES.includes(res.code)) {
                    retry = setTimeout(() => {
                        if (g === gen && s.connected) join(g, attempt + 1);
                    }, retryDelay(attempt));
                }
            });
        };
        const onConnect = () => {
            gen += 1;
            clearTimeout(retry);
            setConn('online');
            join(gen, 0);
        };
        const onDisconnect = (reason: string) => {
            gen += 1;
            clearTimeout(retry);
            if (reason !== 'io client disconnect') setConn('reconnecting');
        };
        const onState = (v: HostView) => {
            stampCountdowns(v.countdown, v.autoAdvance);
            setView(v);
        };
        const onClosed = () => {
            stop('closed');
        };
        s.on('connect', onConnect);
        s.on('disconnect', onDisconnect);
        s.on('host:state', onState);
        s.on('game:closed', onClosed);
        const offAuth = onUnauthenticated(() => {
            stop('UNAUTHENTICATED');
        });
        return () => {
            alive = false;
            clearTimeout(retry);
            offAuth();
            s.off('connect', onConnect);
            s.off('disconnect', onDisconnect);
            s.off('host:state', onState);
            s.off('game:closed', onClosed);
            s.disconnect();
            if (socket.current === s) socket.current = null;
        };
    }, [gameId]);

    const run = useCallback(async (send: (s: GameSocket) => Promise<ErrorCode | null>): Promise<ErrorCode | null> => {
        const s = socket.current;
        if (inFlight.current) return null;
        // Nothing is buffered for a later connection: a command sent before the re-join would be refused anyway.
        if (!s?.connected) return 'INTERNAL_ERROR';
        inFlight.current = true;
        setPending(true);
        try {
            return await send(s);
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    }, []);

    const command = useCallback(
        (e: HostCommand) =>
            run(async (s) => {
                const res = await emitAck(s, e, {});
                return res.ok ? null : res.code;
            }),
        [run],
    );

    const kick = useCallback(
        (playerId: string) =>
            run(async (s) => {
                const res = await emitAck(s, 'host:kick', { playerId });
                return res.ok ? null : res.code;
            }),
        [run],
    );

    return { view, conn, fatal, command, kick, pending };
}
