import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { type Command, type GameState, type ReduceResult, toHostView, toPlayerView } from '@quizpulse/game-engine';
import {
    CLIENT_EVENTS,
    type ClientToServerEvents,
    clientEventSchemas,
    type ErrorCode,
    MAX_PLAYERS,
    type ServerToClientEvents,
} from '@quizpulse/protocol';
import { createAdapter } from '@socket.io/redis-adapter';
import type { RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import { type Namespace, Server, type Socket } from 'socket.io';
import type { z, ZodType } from 'zod';
import { hostIdFromSession, SESSION_MIDDLEWARE, toError } from '../auth/session.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { KeyedMutex } from '../common/keyed-mutex.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { REDIS } from '../redis/redis.module.js';
import type { Broadcaster, ParticipantPresence } from './game.service.js';
import { GameService } from './game.service.js';
import { GameStore } from './game.store.js';
import { Presence } from './presence.js';
import { SocketRateLimiter } from './rate-limit.js';

/** Who a socket speaks for, fixed by a successful `host:join`, `player:join` or `player:rejoin`. */
type Binding = { role: 'host'; gameId: string } | { role: 'player'; gameId: string; playerId: string };

interface SocketData {
    /** The logged-in host behind the handshake cookie, if any. */
    hostId: string | null;
    binding: Binding | null;
}

type NoEvents = Record<string, never>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, NoEvents, SocketData>;
type GameNamespace = Namespace<ClientToServerEvents, ServerToClientEvents, NoEvents, SocketData>;

type ClientEvent = keyof ClientToServerEvents;
type Payload<E extends ClientEvent> = z.infer<(typeof clientEventSchemas)[E]>;
type Reply<E extends ClientEvent> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];
/** `receivedAt` is the server time the event arrived, before rate limiting, validation and locks. */
type Handlers = {
    [E in ClientEvent]: (socket: GameSocket, payload: Payload<E>, receivedAt: number) => Promise<Reply<E>>;
};
type Failure = { ok: false; code: ErrorCode };

const gameRoom = (gameId: string) => `game:${gameId}`;
const hostRoom = (gameId: string) => `game:${gameId}:host`;
const playerRoom = (gameId: string, playerId: string) => `game:${gameId}:player:${playerId}`;
const roomOf = (b: Binding) => (b.role === 'host' ? hostRoom(b.gameId) : playerRoom(b.gameId, b.playerId));

const imageUrl = (imageId: string) => `/api/v1/images/${imageId}`;

const fail = (code: ErrorCode): Failure => ({ ok: false, code });
const reply = (result: ReduceResult): { ok: true } | Failure => (result.ok ? { ok: true } : fail(result.code));

function isConnected(state: GameState, b: Binding): boolean {
    if (b.role === 'host') return state.hostConnected;
    const player = state.players[b.playerId];
    return player !== undefined && !player.kicked && player.connected;
}

function connectionCommand(b: Binding, connected: boolean): Command {
    return b.role === 'host'
        ? { type: 'host_connection', connected }
        : { type: 'player_connection', playerId: b.playerId, connected };
}

/**
 * Socket.io namespace `/game`. Every client event goes through rate limit -> payload validation -> role check
 * -> `GameService.execute` -> ack. Rooms: `game:<id>` (everybody), `game:<id>:host` and
 * `game:<id>:player:<playerId>`. Presence is derived from room membership via the Redis adapter, and the
 * reducer only hears about real online/offline transitions.
 */
@Injectable()
export class GameGateway implements Broadcaster, ParticipantPresence, OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(GameGateway.name);
    private readonly pubClient: Redis;
    private readonly subClient: Redis;
    private readonly io: Server<ClientToServerEvents, ServerToClientEvents, NoEvents, SocketData>;
    private readonly nsp: GameNamespace;
    private readonly presence: Presence;
    private readonly limiter = new SocketRateLimiter();
    /** Serialises the "is the room empty / does the state agree" checks per room, so transitions are not doubled. */
    private readonly presenceLocks = new KeyedMutex();
    private readonly publicOrigin: string;
    private closing = false;
    /** Sockets with a join in flight, so two concurrent joins cannot bind one socket twice. */
    private readonly joining = new Set<string>();

    private readonly handlers: Handlers = {
        'host:join': (socket, p) => this.bindOnce(socket, () => this.hostJoin(socket, p.gameId)),
        'host:start': (socket) => this.asHost(socket, { type: 'start' }),
        'host:next': (socket) => this.asHost(socket, { type: 'next' }),
        'host:pause': (socket) => this.asHost(socket, { type: 'pause' }),
        'host:resume': (socket) => this.asHost(socket, { type: 'resume' }),
        'host:kick': (socket, p) => this.asHost(socket, { type: 'kick', playerId: p.playerId }),
        'host:end': (socket) => this.asHost(socket, { type: 'end' }),
        'player:lookup': (_socket, p) => this.playerLookup(p.pin),
        'player:join': (socket, p) => this.bindOnce(socket, () => this.playerJoin(socket, p.pin, p.nickname)),
        'player:rejoin': (socket, p) => this.bindOnce(socket, () => this.playerRejoin(socket, p.gameId, p.playerToken)),
        'player:answer': async (socket, p, receivedAt) => {
            const b = socket.data.binding;
            if (b?.role !== 'player') return fail('FORBIDDEN');
            // Stamped when the event arrived, so waiting for the game's lock costs neither points nor the deadline.
            const cmd: Command = { type: 'answer', playerId: b.playerId, ...p, receivedAt };
            return reply(await this.games.execute(b.gameId, cmd));
        },
    };

    constructor(
        private readonly adapterHost: HttpAdapterHost,
        private readonly games: GameService,
        private readonly store: GameStore,
        @Inject(REDIS) redis: Redis,
        @Inject(SESSION_MIDDLEWARE) private readonly session: RequestHandler,
        @Inject(APP_CONFIG) config: AppConfig,
        @Inject(CLOCK) private readonly clock: Clock,
    ) {
        this.publicOrigin = new URL(config.publicBaseUrl).origin;
        this.pubClient = redis.duplicate();
        this.subClient = redis.duplicate();
        this.io = new Server({
            serveClient: false,
            adapter: createAdapter(this.pubClient, this.subClient),
            // No CORS headers: the web is served from the same origin (its dev server proxies).
            allowRequest: (req, callback) => {
                callback(null, this.isSameOrigin(req));
            },
        });
        this.nsp = this.io.of('/game');
        this.presence = new Presence(this.nsp);
    }

    onModuleInit(): void {
        this.io.attach(this.adapterHost.httpAdapter.getHttpServer() as HttpServer);
        this.nsp.use((socket, next) => {
            hostIdFromSession(this.session, socket.request).then(
                (hostId) => {
                    socket.data.hostId = hostId;
                    socket.data.binding = null;
                    next();
                },
                (error: unknown) => {
                    next(toError(error));
                },
            );
        });
        this.nsp.on('connection', (socket) => {
            this.onConnection(socket);
        });
        this.games.setBroadcaster(this);
        this.games.setPresence(this);
    }

    async onModuleDestroy(): Promise<void> {
        // Shutting down is not the participants leaving: no presence commands for the sockets closed now.
        this.closing = true;
        await this.io.close();
        await Promise.all([this.pubClient.quit(), this.subClient.quit()]);
    }

    // ---------- Broadcaster ----------

    publish(state: GameState): void {
        const now = this.clock.now();
        this.nsp.to(hostRoom(state.gameId)).emit('host:state', toHostView(state, now, imageUrl));
        for (const playerId of state.playerOrder) {
            if (state.players[playerId]?.kicked !== false) continue;
            this.nsp
                .to(playerRoom(state.gameId, playerId))
                .emit('player:state', toPlayerView(state, playerId, now, imageUrl));
        }
    }

    closed(gameId: string): void {
        this.nsp.to(gameRoom(gameId)).emit('game:closed');
    }

    kicked(gameId: string, playerId: string): void {
        const room = playerRoom(gameId, playerId);
        this.nsp.to(room).emit('player:kicked');
        this.nsp.in(room).disconnectSockets(true);
    }

    // ---------- ParticipantPresence ----------

    isHostOnline(gameId: string): Promise<boolean> {
        return this.presence.isOnline(hostRoom(gameId));
    }

    isPlayerOnline(gameId: string, playerId: string): Promise<boolean> {
        return this.presence.isOnline(playerRoom(gameId, playerId));
    }

    // ---------- connection lifecycle ----------

    private onConnection(socket: GameSocket): void {
        for (const event of CLIENT_EVENTS) {
            (socket as Socket).on(event, (payload: unknown, ack: unknown) => {
                void this.handle(socket, event, payload, ack);
            });
        }
        socket.on('disconnect', () => {
            this.limiter.forget(socket.id);
            const binding = socket.data.binding;
            if (!binding || this.closing) return;
            this.leave(binding).catch((error: unknown) => {
                this.logger.error(`presence update for ${roomOf(binding)} failed: ${errorText(error)}`);
            });
        });
    }

    private async handle(socket: GameSocket, event: ClientEvent, payload: unknown, ack: unknown): Promise<void> {
        const receivedAt = this.clock.now();
        const respond = typeof ack === 'function' ? (ack as (res: unknown) => void) : () => undefined;
        if (!this.limiter.take(socket.id)) {
            respond(fail('RATE_LIMITED'));
            return;
        }
        const parsed = (clientEventSchemas[event] as ZodType).safeParse(payload);
        if (!parsed.success) {
            respond(fail('INVALID_PAYLOAD'));
            return;
        }
        const handler = this.handlers[event] as (
            socket: GameSocket,
            payload: unknown,
            receivedAt: number,
        ) => Promise<unknown>;
        try {
            respond(await handler(socket, parsed.data, receivedAt));
        } catch (error) {
            this.logger.error(`${event} failed: ${errorText(error)}`);
            respond(fail('INTERNAL_ERROR'));
        }
    }

    private async asHost(socket: GameSocket, cmd: Command): Promise<{ ok: true } | Failure> {
        const b = socket.data.binding;
        if (b?.role !== 'host') return fail('FORBIDDEN');
        return reply(await this.games.execute(b.gameId, cmd));
    }

    /** A socket speaks for one participant: joining again, or while a join is in flight, is refused. */
    private async bindOnce<T>(socket: GameSocket, join: () => Promise<T>): Promise<T | Failure> {
        if (socket.data.binding || this.joining.has(socket.id)) return fail('FORBIDDEN');
        this.joining.add(socket.id);
        try {
            return await join();
        } finally {
            this.joining.delete(socket.id);
        }
    }

    private async hostJoin(socket: GameSocket, gameId: string): Promise<Reply<'host:join'>> {
        const { hostId } = socket.data;
        if (hostId === null) return fail('UNAUTHENTICATED');
        const state = await this.store.get(gameId);
        if (!state) return fail('GAME_NOT_FOUND');
        if (state.hostId !== hostId) return fail('NOT_HOST');
        await this.enter(socket, { role: 'host', gameId });
        return { ok: true };
    }

    /** Checks a PIN before the nickname step. Read-only: binds nothing and changes no state. */
    private async playerLookup(pin: string): Promise<Reply<'player:lookup'>> {
        const gameId = await this.store.gameIdByPin(pin);
        const state = gameId === null ? null : await this.store.get(gameId);
        if (!state) return fail('GAME_NOT_FOUND');
        if (state.phase !== 'lobby') return fail('GAME_ALREADY_STARTED');
        if (state.playerOrder.filter((id) => state.players[id]?.kicked === false).length >= MAX_PLAYERS) {
            return fail('GAME_FULL');
        }
        return { ok: true, quizTitle: state.quiz.title };
    }

    private async playerJoin(socket: GameSocket, pin: string, nickname: string): Promise<Reply<'player:join'>> {
        const gameId = await this.store.gameIdByPin(pin);
        if (gameId === null) return fail('GAME_NOT_FOUND');
        const playerId = randomUUID();
        // The token goes first: if issuing fails nothing has joined, so no offline "ghost" player is left behind.
        // A token for a join that is then refused (nickname taken, game full) is unreachable and expires with the game.
        const playerToken = await this.store.issuePlayerToken(gameId, playerId);
        const result = await this.games.execute(gameId, { type: 'player_join', playerId, nickname });
        if (!result.ok) return fail(result.code);
        await this.enter(socket, { role: 'player', gameId, playerId });
        return { ok: true, playerId, playerToken, gameId };
    }

    private async playerRejoin(socket: GameSocket, gameId: string, token: string): Promise<Reply<'player:rejoin'>> {
        const state = await this.store.get(gameId);
        if (!state) return fail('GAME_NOT_FOUND');
        const playerId = await this.store.playerIdByToken(gameId, token);
        const player = playerId === null ? undefined : state.players[playerId];
        if (!player) return fail('INVALID_TOKEN');
        if (player.kicked) return fail('KICKED');
        await this.enter(socket, { role: 'player', gameId, playerId: player.id });
        return { ok: true, playerId: player.id };
    }

    /**
     * Binds the socket, joins its rooms and marks the participant online if the state says it was offline;
     * otherwise sends the current snapshot (a reconnecting client needs it even when nothing changed).
     */
    private async enter(socket: GameSocket, binding: Binding): Promise<void> {
        socket.data.binding = binding;
        const room = roomOf(binding);
        if (socket.disconnected) {
            // It left while we were getting here and its disconnect handler may not have seen the binding. It
            // joins no rooms: nothing would remove a closed socket from them.
            await this.leave(binding);
            return;
        }
        await socket.join([gameRoom(binding.gameId), room]);
        await this.presenceLocks.run(room, async () => {
            const state = await this.store.get(binding.gameId);
            if (state && state.phase !== 'finished' && !isConnected(state, binding)) {
                // The broadcast of a successful command reaches this socket too: it is in the room already.
                if ((await this.games.execute(binding.gameId, connectionCommand(binding, true))).ok) return;
            }
            await this.games.withState(binding.gameId, (s) => {
                if (s) this.sendSnapshot(socket, s, binding);
            });
        });
    }

    /** Marks the participant offline once its last socket has left the room. */
    private async leave(binding: Binding): Promise<void> {
        const room = roomOf(binding);
        await this.presenceLocks.run(room, async () => {
            if (await this.presence.isOnline(room)) return;
            const state = await this.store.get(binding.gameId);
            // The state check drops a second "offline" for sockets that closed together: each host_connection
            // false restarts the 30-minute absence window.
            if (state && state.phase !== 'finished' && isConnected(state, binding)) {
                await this.games.execute(binding.gameId, connectionCommand(binding, false));
            }
        });
    }

    private sendSnapshot(socket: GameSocket, state: GameState, binding: Binding): void {
        const now = this.clock.now();
        if (binding.role === 'host') {
            socket.emit('host:state', toHostView(state, now, imageUrl));
        } else if (state.players[binding.playerId]?.kicked === false) {
            socket.emit('player:state', toPlayerView(state, binding.playerId, now, imageUrl));
        }
    }

    /**
     * Browsers must come from `PUBLIC_BASE_URL` or from the host they actually addressed: the `Host` header, or
     * `X-Forwarded-Host` when a proxy in front rewrote `Host`. The comparison is exact, port included.
     * Non-browser clients send no Origin.
     */
    private isSameOrigin(req: IncomingMessage): boolean {
        const { origin, host } = req.headers;
        if (origin === undefined) return true;
        if (origin === this.publicOrigin) return true;
        let originHost: string;
        try {
            originHost = new URL(origin).host;
        } catch {
            return false;
        }
        return originHost === host?.toLowerCase() || originHost === forwardedHost(req);
    }
}

/**
 * The host the browser addressed according to the proxy in front: the first `X-Forwarded-Host` entry (later
 * entries come from further proxies along the way).
 */
function forwardedHost(req: IncomingMessage): string | null {
    const raw = req.headers['x-forwarded-host'];
    const first = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim().toLowerCase();
    return first === undefined || first === '' ? null : first;
}

const errorText = (error: unknown): string => (error instanceof Error ? (error.stack ?? error.message) : String(error));
