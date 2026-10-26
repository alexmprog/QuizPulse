import type { ErrorCode, PlayerAnswer, PlayerView } from '@quizpulse/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { stampCountdowns } from './clock';
import { clearSession, loadSession, saveSession, type PlayerSession } from './playerSession';
import {
    ACK_TIMEOUT_MS,
    createGameSocket,
    emitAck,
    retryDelay,
    TRANSIENT_CODES,
    type AckResult,
    type GameSocket,
} from './socket';
import type { Conn } from './useHostGame';

export type PlayerExit = 'kicked' | 'closed';

export interface PlayerGame {
    view: PlayerView | null;
    conn: Conn;
    /** Why the player is out of the game; cleared by `leave`. */
    exit: PlayerExit | null;
    /** A saved session is being restored (the latest `player:rejoin` has not settled yet). */
    restoring: boolean;
    /** An answer is waiting for its ack. */
    answering: boolean;
    /**
     * Resolves with the refusal code, or null once joined (the session is saved). While disconnected it resolves
     * `INTERNAL_ERROR` without sending; a successful ack that comes after the timeout still saves the session.
     */
    join: (pin: string, nickname: string) => Promise<ErrorCode | null>;
    /** Checks a PIN before the nickname step; `INTERNAL_ERROR` without sending while disconnected. */
    lookup: (pin: string) => Promise<{ quizTitle: string } | ErrorCode>;
    /**
     * Answers the visible question; resolves with the refusal code or null when accepted. One answer is in flight
     * at a time: a call meanwhile is ignored and resolves null. Without a view or while disconnected it resolves
     * `INTERNAL_ERROR` without sending.
     */
    answer: (a: PlayerAnswer) => Promise<ErrorCode | null>;
    /** Forgets the game: clears the session, the view and the exit, and starts a fresh (unbound) connection. */
    leave: () => void;
}

/** Rejoin answers that mean the saved session is useless. */
const STALE: readonly ErrorCode[] = ['INVALID_TOKEN', 'GAME_NOT_FOUND'];

function canRestore(pinFromUrl: string | null): boolean {
    const s = loadSession();
    return s !== null && (pinFromUrl === null || pinFromUrl === s.pin);
}

/**
 * The player's connection. Until a session exists the socket is connected but bound to nothing. On every
 * `connect` a saved session for the PIN of the link (or any, without a PIN in the link; or the PIN this hook
 * last joined) is resumed with `player:rejoin`; a session for another PIN is dropped without asking the server.
 * A transient rejoin refusal (`INTERNAL_ERROR`, timeout, `RATE_LIMITED`) is retried after a backoff.
 */
export function usePlayerGame(
    pinFromUrl: string | null,
    socketFactory: () => GameSocket = createGameSocket,
): PlayerGame {
    const [view, setView] = useState<PlayerView | null>(null);
    const [conn, setConn] = useState<Conn>('connecting');
    const [exit, setExit] = useState<PlayerExit | null>(null);
    const [restoring, setRestoring] = useState(() => canRestore(pinFromUrl));
    const [answering, setAnswering] = useState(false);
    const factory = useRef(socketFactory);
    /** The PIN a saved session must match: the link's, or the one joined here since. */
    const pinRef = useRef(pinFromUrl);
    const socket = useRef<GameSocket | null>(null);
    const viewRef = useRef<PlayerView | null>(null);
    const answeringRef = useRef(false);
    /** Bumped on every connect, disconnect and leave: acks and retries of an older one are dropped. */
    const gen = useRef(0);

    useEffect(() => {
        pinRef.current = pinFromUrl;
    }, [pinFromUrl]);

    useEffect(() => {
        const s = factory.current();
        socket.current = s;
        let alive = true;
        let retry: ReturnType<typeof setTimeout> | undefined;
        const show = (v: PlayerView | null) => {
            viewRef.current = v;
            setView(v);
        };
        const out = (why: PlayerExit) => {
            clearSession();
            setRestoring(false);
            setExit(why);
        };
        const rejoin = (g: number, session: PlayerSession, attempt: number) => {
            void emitAck(s, 'player:rejoin', { gameId: session.gameId, playerToken: session.playerToken }).then(
                (res) => {
                    if (!alive || g !== gen.current) return;
                    if (!res.ok && TRANSIENT_CODES.includes(res.code)) {
                        retry = setTimeout(() => {
                            if (g === gen.current && s.connected) rejoin(g, session, attempt + 1);
                        }, retryDelay(attempt));
                        return;
                    }
                    setRestoring(false);
                    if (res.ok) return;
                    if (res.code === 'KICKED') {
                        out('kicked');
                    } else if (STALE.includes(res.code)) {
                        clearSession();
                        show(null);
                    }
                },
            );
        };
        const onConnect = () => {
            const g = ++gen.current;
            clearTimeout(retry);
            setConn('online');
            const session = loadSession();
            if (!session) return;
            if (pinRef.current !== null && pinRef.current !== session.pin) {
                clearSession();
                setRestoring(false);
                return;
            }
            setRestoring(true);
            rejoin(g, session, 0);
        };
        const onDisconnect = (reason: string) => {
            gen.current += 1;
            clearTimeout(retry);
            if (reason === 'io client disconnect') return;
            setConn('reconnecting');
            // The server dropped us (a kick): socket.io does not retry that, so start a fresh connection.
            if (reason === 'io server disconnect') s.connect();
        };
        const onState = (v: PlayerView) => {
            stampCountdowns(v.countdown);
            show(v);
        };
        const onKicked = () => {
            out('kicked');
        };
        const onClosed = () => {
            out('closed');
        };
        s.on('connect', onConnect);
        s.on('disconnect', onDisconnect);
        s.on('player:state', onState);
        s.on('player:kicked', onKicked);
        s.on('game:closed', onClosed);
        return () => {
            alive = false;
            clearTimeout(retry);
            s.off('connect', onConnect);
            s.off('disconnect', onDisconnect);
            s.off('player:state', onState);
            s.off('player:kicked', onKicked);
            s.off('game:closed', onClosed);
            s.disconnect();
            if (socket.current === s) socket.current = null;
        };
    }, []);

    const join = useCallback(async (pin: string, nickname: string): Promise<ErrorCode | null> => {
        const s = socket.current;
        if (!s?.connected) return 'INTERNAL_ERROR';
        const keep = (res: AckResult<'player:join'>) => {
            if (!res.ok) return;
            saveSession({ pin, gameId: res.gameId, playerId: res.playerId, playerToken: res.playerToken });
            // The typed PIN may differ from the link's: the new session must survive the next reconnect.
            pinRef.current = pin;
            setExit(null);
        };
        // The server may have joined us even though the ack came after the timeout: keep that seat for a reload.
        const res = await emitAck(s, 'player:join', { pin, nickname }, ACK_TIMEOUT_MS, (late) => {
            if (loadSession() === null) keep(late);
        });
        if (!res.ok) return res.code;
        keep(res);
        return null;
    }, []);

    const lookup = useCallback(async (pin: string): Promise<{ quizTitle: string } | ErrorCode> => {
        const s = socket.current;
        if (!s?.connected) return 'INTERNAL_ERROR';
        const res = await emitAck(s, 'player:lookup', { pin });
        return res.ok ? { quizTitle: res.quizTitle } : res.code;
    }, []);

    const answer = useCallback(async (a: PlayerAnswer): Promise<ErrorCode | null> => {
        if (answeringRef.current) return null;
        const s = socket.current;
        const v = viewRef.current;
        if (!s?.connected || !v) return 'INTERNAL_ERROR';
        answeringRef.current = true;
        setAnswering(true);
        try {
            const res = await emitAck(s, 'player:answer', { questionIndex: v.questionIndex, answer: a });
            return res.ok ? null : res.code;
        } finally {
            answeringRef.current = false;
            setAnswering(false);
        }
    }, []);

    const leave = useCallback(() => {
        gen.current += 1;
        clearSession();
        viewRef.current = null;
        setView(null);
        setExit(null);
        setRestoring(false);
        // The old socket may still be bound to the finished game; the server binds a socket only once.
        const s = socket.current;
        if (s) {
            s.disconnect();
            s.connect();
        }
    }, []);

    return { view, conn, exit, restoring, answering, join, lookup, answer, leave };
}
