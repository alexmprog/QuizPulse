import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import {
    type Command,
    createGame,
    type Effect,
    type GameState,
    pendingTimers,
    reduce,
    type ReduceResult,
    type TimerKind,
} from '@quizpulse/game-engine';
import { CLOCK, type Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { KeyedMutex } from '../common/keyed-mutex.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { QuizzesService } from '../quizzes/quizzes.service.js';
import { GameStore } from './game.store.js';
import { GameTimers } from './game.timers.js';
import { HistoryService } from './history.service.js';

const PERSIST_ATTEMPTS = 3;

/** Fan-out of game changes to connected clients (Socket.io from Task 12). */
export interface Broadcaster {
    publish(state: GameState): void;
    closed(gameId: string): void;
    kicked(gameId: string, playerId: string): void;
}

const silentBroadcaster: Broadcaster = {
    publish: () => undefined,
    closed: () => undefined,
    kicked: () => undefined,
};

/** Whether a participant has a socket open anywhere (Socket.io rooms from Task 12). */
export interface ParticipantPresence {
    isHostOnline(gameId: string): Promise<boolean>;
    isPlayerOnline(gameId: string, playerId: string): Promise<boolean>;
}

/** Without a socket layer nobody can be connected. */
const nobodyOnline: ParticipantPresence = {
    isHostOnline: () => Promise.resolve(false),
    isPlayerOnline: () => Promise.resolve(false),
};

export interface CreatedGame {
    gameId: string;
    pin: string;
    joinUrl: string;
}

/** Runs commands through the reducer against Redis state and carries out the effects it asks for. */
@Injectable()
export class GameService implements OnModuleInit, OnApplicationBootstrap {
    private readonly logger = new Logger(GameService.name);
    private readonly locks = new KeyedMutex();
    private broadcaster: Broadcaster = silentBroadcaster;
    private presence: ParticipantPresence = nobodyOnline;

    constructor(
        private readonly store: GameStore,
        private readonly timers: GameTimers,
        private readonly history: HistoryService,
        private readonly quizzes: QuizzesService,
        @Inject(APP_CONFIG) private readonly config: AppConfig,
        @Inject(CLOCK) private readonly clock: Clock,
    ) {}

    onModuleInit(): void {
        this.timers.onFire((gameId, timer, epoch) => this.onTimer(gameId, timer, epoch));
    }

    /**
     * Recovery after a (re)start, before the HTTP server accepts connections: finished games whose history
     * did not reach Postgres are saved now, and in running games everybody without a socket goes offline (the
     * previous process could not say so on its way down). Clients that come back go online through the usual
     * join; the host finds the game paused and resumes it by hand. Last, the timer each game waits for is
     * scheduled again from its state, in case its job was lost (scheduling is idempotent per timer and epoch).
     */
    async onApplicationBootstrap(): Promise<void> {
        for (const state of await this.store.listFinishedGames()) {
            await this.recover(state.gameId, 'saving history', () => this.saveUnsavedHistory(state));
        }
        for (const gameId of await this.store.listActiveGameIds()) {
            await this.recover(gameId, 'presence', () => this.markAbsentOffline(gameId));
            await this.recover(gameId, 'timers', () => this.rescheduleTimers(gameId));
        }
    }

    setBroadcaster(broadcaster: Broadcaster): void {
        this.broadcaster = broadcaster;
    }

    setPresence(presence: ParticipantPresence): void {
        this.presence = presence;
    }

    /**
     * Opens a lobby for an own quiz or a built-in pack; a host has at most one active game. The state is written
     * before the host slot is claimed, so a slot whose game state is missing really has expired.
     */
    async createGame(hostId: string, quizId: string): Promise<CreatedGame> {
        const quiz = await this.quizzes.snapshotForGame(hostId, quizId);
        const gameId = randomUUID();
        const pin = await this.store.allocatePin(gameId);
        const joinUrl = joinUrlFor(this.config.publicBaseUrl, pin);
        try {
            const { state, effects } = createGame({ gameId, hostId, pin, joinUrl, quiz, now: this.clock.now() });
            await this.store.create(state);
            await this.claimHostSlot(hostId, gameId);
            // The host_absent timer, so a lobby whose host never opens a socket is closed.
            for (const effect of effects) await this.applyEffect(state, effect);
        } catch (error) {
            await this.store.delete(gameId);
            await this.store.releasePin(pin, gameId);
            throw error;
        }
        return { gameId, pin, joinUrl };
    }

    /** The host's active game, or null. */
    async activeGame(hostId: string): Promise<CreatedGame | null> {
        const gameId = await this.store.activeGameOf(hostId);
        const state = gameId === null ? null : await this.store.get(gameId);
        if (!state || state.phase === 'finished') return null;
        return { gameId: state.gameId, pin: state.pin, joinUrl: state.joinUrl };
    }

    /**
     * Applies `cmd` atomically. On success the effects run in order, then the committed state is broadcast
     * (or `closed` when the lobby was closed), even if an effect failed. A missing game yields `GAME_NOT_FOUND`.
     * Commands for one game run one at a time in this process; the store's WATCH/MULTI guards across processes.
     */
    execute(gameId: string, cmd: Command): Promise<ReduceResult> {
        return this.locks.run(gameId, () => this.executeNow(gameId, cmd));
    }

    /**
     * Runs `fn` on the current state (null when the game is gone) inside the game's lock, so anything `fn` emits
     * is ordered with the broadcasts of commands. `fn` must not call `execute` for the same game.
     */
    withState<T>(gameId: string, fn: (state: GameState | null) => T): Promise<T> {
        return this.locks.run(gameId, async () => fn(await this.store.get(gameId)));
    }

    private async executeNow(gameId: string, cmd: Command): Promise<ReduceResult> {
        const result = await this.store.update(gameId, (state) => reduce(state, cmd, this.clock.now()));
        if (!result.ok) return result;
        const { state, effects } = result;
        for (const effect of effects) {
            try {
                await this.applyEffect(state, effect);
            } catch (error) {
                this.logger.error(`game ${gameId}: effect ${effect.type} failed: ${errorText(error)}`);
            }
        }
        if (effects.some((e) => e.type === 'close_lobby')) this.broadcaster.closed(gameId);
        else this.broadcaster.publish(state);
        return result;
    }

    private async onTimer(gameId: string, timer: TimerKind, epoch: number): Promise<void> {
        // Stale timers and timers of deleted games are no-ops by design.
        await this.execute(gameId, { type: 'timer_fired', timer, epoch });
    }

    private async applyEffect(state: GameState, effect: Effect): Promise<void> {
        switch (effect.type) {
            case 'schedule':
                await this.timers.schedule(state.gameId, effect.timer, effect.epoch, effect.at);
                return;
            case 'persist_history':
                await this.saveHistory(state);
                return;
            case 'close_lobby':
                await this.store.delete(state.gameId);
                return;
            case 'notify_kicked':
                this.broadcaster.kicked(state.gameId, effect.playerId);
                return;
        }
    }

    /** Saves a finished game and frees its PIN and the host's slot: the game is over even if saving failed. */
    private async saveHistory(state: GameState): Promise<void> {
        try {
            await this.persistWithRetry(state);
        } finally {
            await this.releaseFinished(state);
        }
    }

    /** A finished game still in Redis whose history row is missing (saving failed or the process died). */
    private async saveUnsavedHistory(state: GameState): Promise<void> {
        try {
            if (await this.history.has(state.gameId)) return;
            this.logger.warn(`game ${state.gameId}: finished without saved history, saving it now`);
            await this.persistWithRetry(state);
        } finally {
            // Finished either way: a game whose history is already saved may still hold its PIN and host slot.
            await this.releaseFinished(state);
        }
    }

    private async releaseFinished(state: GameState): Promise<void> {
        await this.store.releasePin(state.pin, state.gameId);
        await this.store.releaseHost(state.hostId, state.gameId);
    }

    /**
     * Sends the "offline" the previous process could not, for participants with no socket. Only real
     * transitions are sent: each host_connection false restarts the 30-minute absence window. The host goes
     * first, so the game is paused before players drop: otherwise the remaining connected players having
     * answered would close the question early.
     */
    private async markAbsentOffline(gameId: string): Promise<void> {
        const state = await this.store.get(gameId);
        if (!state || state.phase === 'finished') return;
        if (state.hostConnected && !(await this.isOnline(gameId, () => this.presence.isHostOnline(gameId)))) {
            await this.execute(gameId, { type: 'host_connection', connected: false });
        }
        for (const playerId of state.playerOrder) {
            const player = state.players[playerId];
            if (!player || player.kicked || !player.connected) continue;
            if (await this.isOnline(gameId, () => this.presence.isPlayerOnline(gameId, playerId))) continue;
            await this.execute(gameId, { type: 'player_connection', playerId, connected: false });
        }
    }

    /** Re-schedules the timers the state waits for; a job that still exists is left as it is (same job id). */
    private async rescheduleTimers(gameId: string): Promise<void> {
        await this.withState(gameId, async (state) => {
            if (!state) return;
            for (const effect of pendingTimers(state, this.clock.now())) await this.applyEffect(state, effect);
        });
    }

    /**
     * Before the server listens nobody is connected (single instance), so a presence query that fails is
     * answered with "offline" rather than skipping the recovery and leaving a stale "online".
     */
    private async isOnline(gameId: string, query: () => Promise<boolean>): Promise<boolean> {
        try {
            return await query();
        } catch (error) {
            this.logger.warn(`game ${gameId}: presence query failed, treating as offline: ${errorText(error)}`);
            return false;
        }
    }

    /** One game's recovery failing must not keep the others (or the app) from starting. */
    private async recover(gameId: string, what: string, fn: () => Promise<void>): Promise<void> {
        try {
            await fn();
        } catch (error) {
            this.logger.error(`game ${gameId}: recovery (${what}) failed: ${errorText(error)}`);
        }
    }

    /** `persist` is idempotent, so a failed attempt is simply repeated. */
    private async persistWithRetry(state: GameState): Promise<void> {
        for (let attempt = 1; ; attempt += 1) {
            try {
                await this.history.persist(state);
                return;
            } catch (error) {
                if (attempt >= PERSIST_ATTEMPTS) throw error;
                this.logger.warn(`game ${state.gameId}: saving history failed (attempt ${String(attempt)}), retrying`);
            }
        }
    }

    /** Claims the host slot for `gameId` (whose state already exists) or throws `409 ACTIVE_GAME_EXISTS`. */
    private async claimHostSlot(hostId: string, gameId: string): Promise<void> {
        for (;;) {
            if (await this.store.claimHost(hostId, gameId)) return;
            const existing = await this.store.activeGameOf(hostId);
            if (existing === null) continue; // freed in the meantime
            const state = await this.store.get(existing);
            if (state && state.phase !== 'finished') {
                throw new AppError('ACTIVE_GAME_EXISTS', 409, { gameId: existing });
            }
            // States are written before slots are claimed, so this game expired or finished without releasing it.
            await this.store.releaseHost(hostId, existing);
        }
    }
}

const errorText = (error: unknown): string => (error instanceof Error ? (error.stack ?? error.message) : String(error));

export function joinUrlFor(publicBaseUrl: string, pin: string): string {
    return `${publicBaseUrl}/play?pin=${pin}`;
}
