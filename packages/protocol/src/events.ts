import type { ErrorCode } from './errors.js';
import type { PlayerAnswer } from './quiz.js';
import type { HostView, PlayerView } from './views.js';

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; code: ErrorCode }) => void;

/** Socket.io namespace "/game". */
export interface ClientToServerEvents {
    'host:join': (p: { gameId: string }, ack: Ack) => void;
    'host:start': (p: object, ack: Ack) => void;
    'host:next': (p: object, ack: Ack) => void;
    'host:pause': (p: object, ack: Ack) => void;
    'host:resume': (p: object, ack: Ack) => void;
    'host:kick': (p: { playerId: string }, ack: Ack) => void;
    'host:end': (p: object, ack: Ack) => void;
    'player:lookup': (p: { pin: string }, ack: Ack<{ quizTitle: string }>) => void;
    'player:join': (
        p: { pin: string; nickname: string },
        ack: Ack<{ playerId: string; playerToken: string; gameId: string }>,
    ) => void;
    'player:rejoin': (p: { gameId: string; playerToken: string }, ack: Ack<{ playerId: string }>) => void;
    'player:answer': (p: { questionIndex: number; answer: PlayerAnswer }, ack: Ack) => void;
}

export interface ServerToClientEvents {
    'host:state': (v: HostView) => void;
    'player:state': (v: PlayerView) => void;
    'player:kicked': () => void;
    /** Lobby closed by the host or by timeout. */
    'game:closed': () => void;
}

export const CLIENT_EVENTS = [
    'host:join',
    'host:start',
    'host:next',
    'host:pause',
    'host:resume',
    'host:kick',
    'host:end',
    'player:lookup',
    'player:join',
    'player:rejoin',
    'player:answer',
] as const satisfies readonly (keyof ClientToServerEvents)[];

export const SERVER_EVENTS = [
    'host:state',
    'player:state',
    'player:kicked',
    'game:closed',
] as const satisfies readonly (keyof ServerToClientEvents)[];
