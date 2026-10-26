import { Logger } from '@nestjs/common';
import type { components } from '@quizpulse/api-types';
import { type Command, scoreQuestion } from '@quizpulse/game-engine';
import type { ErrorCode, GamePhase, HostView, PlayerAnswer, PlayerView } from '@quizpulse/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GameGateway } from '../src/games/game.gateway.js';
import { GameService } from '../src/games/game.service.js';
import { GameStore } from '../src/games/game.store.js';
import { createTestApp, type TestApp } from './support/app.js';
import { ManualClock } from './support/clock.js';
import { current, type HostWithQuiz, hostWithQuiz } from './support/games.js';
import { registerHost } from './support/hosts.js';
import { sampleQuiz } from './support/quiz-fixtures.js';
import {
    connectHost,
    connectPlayer,
    connectWithHeaders,
    cookieOf,
    disconnected,
    nextState,
    type TypedSocket,
} from './support/socket-client.js';

type GameCreated = components['schemas']['GameCreated'];
type GameSummary = components['schemas']['GameSummary'];
type AckResult = { ok: true } | { ok: false; code: ErrorCode };

interface Lobby {
    host: HostWithQuiz;
    hostSocket: TypedSocket;
    gameId: string;
    pin: string;
}

interface JoinedPlayer {
    socket: TypedSocket;
    playerId: string;
    playerToken: string;
    /** Every `player:state` this socket received, from the join on. */
    states: PlayerView[];
}

/** Time for the server to handle a disconnect (or deliberately do nothing about it). */
const SETTLE_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function expectOk<T extends AckResult>(res: T): Extract<T, { ok: true }> {
    if (!res.ok) throw new Error(`expected ok, got ${(res as { code: ErrorCode }).code}`);
    return res as Extract<T, { ok: true }>;
}

const codeOf = (res: AckResult): string => (res.ok ? 'ok' : res.code);

/** Phases in order, without consecutive repeats. */
const phases = (views: { phase: GamePhase }[]): GamePhase[] =>
    views.map((v) => v.phase).filter((phase, i, all) => i === 0 || all[i - 1] !== phase);

const playerIn = (v: HostView, playerId: string) => v.players.find((p) => p.id === playerId);

const connectionCommands = (spy: { mock: { calls: unknown[][] } }): Command[] =>
    spy.mock.calls
        .map((call) => call[1] as Command)
        .filter((cmd) => cmd.type === 'player_connection' || cmd.type === 'host_connection');

describe('game gateway', () => {
    let ctx: TestApp;
    let clock: ManualClock;
    let store: GameStore;
    let service: GameService;
    const sockets: TypedSocket[] = [];

    const track = async (pending: Promise<TypedSocket>): Promise<TypedSocket> => {
        const socket = await pending;
        sockets.push(socket);
        return socket;
    };

    async function openLobby(quiz = sampleQuiz()): Promise<Lobby> {
        const host = await hostWithQuiz(ctx.url, quiz);
        const res = await host.client.request('POST', '/api/v1/games', { body: { quizId: host.quizId } });
        expect(res.status).toBe(201);
        const { gameId, pin } = (await res.json()) as GameCreated;
        const hostSocket = await track(connectHost(ctx.url, cookieOf(host.client)));
        const snapshot = nextState(hostSocket, 'host:state');
        expectOk(await hostSocket.emitWithAck('host:join', { gameId }));
        expect(await snapshot).toMatchObject({ gameId, pin, phase: 'lobby' });
        return { host, hostSocket, gameId, pin };
    }

    async function joinPlayer(pin: string, nickname: string): Promise<JoinedPlayer> {
        const socket = await track(connectPlayer(ctx.url));
        const states: PlayerView[] = [];
        socket.on('player:state', (v) => states.push(v));
        const snapshot = nextState(socket, 'player:state');
        const ack = expectOk(await socket.emitWithAck('player:join', { pin, nickname }));
        expect(await snapshot).toMatchObject({ phase: 'lobby', me: { id: ack.playerId, nickname: nickname.trim() } });
        return { socket, playerId: ack.playerId, playerToken: ack.playerToken, states };
    }

    async function hostCommand(
        lobby: Lobby,
        event: 'host:start' | 'host:next',
        phase: GamePhase,
        questionIndex: number,
    ): Promise<HostView> {
        const reached = nextState(
            lobby.hostSocket,
            'host:state',
            (v) => v.phase === phase && v.questionIndex === questionIndex,
        );
        expectOk(await lobby.hostSocket.emitWithAck(event, {}));
        return reached;
    }

    /** Every player answers; with `earlyClose` the last answer closes the question. */
    async function answerAll(lobby: Lobby, questionIndex: number, answers: [JoinedPlayer, PlayerAnswer][]) {
        const closed = nextState(
            lobby.hostSocket,
            'host:state',
            (v) => v.phase === 'question_results' && v.questionIndex === questionIndex,
        );
        for (const [player, answer] of answers) {
            expectOk(await player.socket.emitWithAck('player:answer', { questionIndex, answer }));
        }
        return closed;
    }

    beforeAll(async () => {
        clock = new ManualClock();
        ctx = await createTestApp({ clock });
        store = ctx.app.get(GameStore);
        service = ctx.app.get(GameService);
    });
    afterEach(() => {
        vi.restoreAllMocks();
        for (const socket of sockets.splice(0)) socket.close();
    });
    afterAll(async () => {
        await ctx.close();
    });

    it('full game: 2 players, 3 questions, leaderboard after q2, finish completed', async () => {
        const quiz = sampleQuiz();
        quiz.settings.leaderboardEvery = 2;
        const lobby = await openLobby(quiz);
        const hostStates: HostView[] = [];
        lobby.hostSocket.on('host:state', (v) => hostStates.push(v));
        const alice = await joinPlayer(lobby.pin, 'Alice');
        const bob = await joinPlayer(lobby.pin, '  Bob  ');

        await hostCommand(lobby, 'host:start', 'question_open', 0);
        clock.advance(5000);
        await answerAll(lobby, 0, [
            [alice, { kind: 'option', option: 0 }],
            [bob, { kind: 'option', option: 1 }],
        ]);
        await hostCommand(lobby, 'host:next', 'question_open', 1);
        clock.advance(2000);
        await answerAll(lobby, 1, [
            [alice, { kind: 'option', option: 1 }],
            [bob, { kind: 'option', option: 0 }],
        ]);
        await hostCommand(lobby, 'host:next', 'leaderboard', 1);
        await hostCommand(lobby, 'host:next', 'question_open', 2);
        clock.advance(10_000);
        await answerAll(lobby, 2, [
            [alice, { kind: 'numeric', value: 8 }],
            [bob, { kind: 'numeric', value: 5 }],
        ]);
        const aliceDone = nextState(alice.socket, 'player:state', (v) => v.phase === 'finished');
        const bobDone = nextState(bob.socket, 'player:state', (v) => v.phase === 'finished');
        const final = await hostCommand(lobby, 'host:next', 'finished', 2);
        const [aliceFinal, bobFinal] = await Promise.all([aliceDone, bobDone]);

        const expected: GamePhase[] = [
            'lobby',
            'question_open',
            'question_results',
            'question_open',
            'question_results',
            'leaderboard',
            'question_open',
            'question_results',
            'finished',
        ];
        expect(phases(hostStates)).toEqual(expected);
        expect(phases(alice.states)).toEqual(expected);
        expect(phases(bob.states)).toEqual(expected);

        // Numeric scoring depends on everybody's answers (the closest one may get points), so score per question.
        const questions = (await current(store, lobby.gameId)).quiz.questions;
        const answered: [PlayerAnswer, PlayerAnswer, number][] = [
            [{ kind: 'option', option: 0 }, { kind: 'option', option: 1 }, 5000],
            [{ kind: 'option', option: 1 }, { kind: 'option', option: 0 }, 2000],
            [{ kind: 'numeric', value: 8 }, { kind: 'numeric', value: 5 }, 10_000],
        ];
        let aliceScore = 0;
        let bobScore = 0;
        answered.forEach(([aliceAnswer, bobAnswer, activeMs], i) => {
            const q = questions[i];
            if (!q) throw new Error(`missing question ${String(i)}`);
            const [a, b] = scoreQuestion(q, [
                { playerId: alice.playerId, answer: aliceAnswer, activeMs },
                { playerId: bob.playerId, answer: bobAnswer, activeMs },
            ]);
            aliceScore += a?.points ?? 0;
            bobScore += b?.points ?? 0;
        });
        expect(aliceScore).toBeGreaterThan(bobScore);
        expect(bobScore).toBeGreaterThan(0);

        expect(final.outcome).toBe('completed');
        expect(final.players.map((p) => [p.nickname, p.score])).toEqual([
            ['Alice', aliceScore],
            ['Bob', bobScore],
        ]);
        expect(final.leaderboard?.map((e) => [e.playerId, e.score, e.rank])).toEqual([
            [alice.playerId, aliceScore, 1],
            [bob.playerId, bobScore, 2],
        ]);
        expect(aliceFinal.me).toMatchObject({ score: aliceScore, rank: 1 });
        expect(bobFinal.me).toMatchObject({ score: bobScore, rank: 2 });
        expect(aliceFinal.podium?.map((e) => e.playerId)).toEqual([alice.playerId, bob.playerId]);

        const history = await lobby.host.client.request('GET', '/api/v1/history');
        expect(history.status).toBe(200);
        const games = (await history.json()) as GameSummary[];
        expect(games).toHaveLength(1);
        expect(games[0]).toMatchObject({ gameId: lobby.gameId, status: 'completed', playerCount: 2 });
    });

    it('player:state during question_open has no correct answer', async () => {
        const lobby = await openLobby();
        const alice = await joinPlayer(lobby.pin, 'Alice');
        const playerOpen = nextState(alice.socket, 'player:state', (v) => v.phase === 'question_open');
        const hostOpen = await hostCommand(lobby, 'host:start', 'question_open', 0);
        const view = await playerOpen;
        expect(view.question?.text).toBe('Capital of France?');
        expect(JSON.stringify(view)).not.toContain('correctOption');
        expect(JSON.stringify(view)).not.toContain('numericAnswer');
        expect(JSON.stringify(hostOpen)).not.toContain('correctOption');
    });

    it('rejoin by token after disconnect restores score and answered flag', async () => {
        const lobby = await openLobby();
        const alice = await joinPlayer(lobby.pin, 'Alice');
        const bob = await joinPlayer(lobby.pin, 'Bob');
        await hostCommand(lobby, 'host:start', 'question_open', 0);
        clock.advance(1000);
        await answerAll(lobby, 0, [
            [alice, { kind: 'option', option: 0 }],
            [bob, { kind: 'option', option: 1 }],
        ]);
        await hostCommand(lobby, 'host:next', 'question_open', 1);
        const answered = nextState(
            lobby.hostSocket,
            'host:state',
            (v) => playerIn(v, alice.playerId)?.answered === true,
        );
        expectOk(
            await alice.socket.emitWithAck('player:answer', {
                questionIndex: 1,
                answer: { kind: 'option', option: 0 },
            }),
        );
        await answered;
        const score = (await current(store, lobby.gameId)).players[alice.playerId]?.score;
        expect(score).toBeGreaterThan(0);

        const offline = nextState(
            lobby.hostSocket,
            'host:state',
            (v) => playerIn(v, alice.playerId)?.connected === false,
        );
        alice.socket.close();
        expect((await offline).phase).toBe('question_open'); // Bob has not answered yet

        const again = await track(connectPlayer(ctx.url));
        const snapshot = nextState(again, 'player:state');
        const online = nextState(
            lobby.hostSocket,
            'host:state',
            (v) => playerIn(v, alice.playerId)?.connected === true,
        );
        const ack = expectOk(
            await again.emitWithAck('player:rejoin', { gameId: lobby.gameId, playerToken: alice.playerToken }),
        );
        expect(ack.playerId).toBe(alice.playerId);
        expect(await snapshot).toMatchObject({
            phase: 'question_open',
            questionIndex: 1,
            answered: true,
            me: { id: alice.playerId, nickname: 'Alice', score },
        });
        await online;
    });

    it('second tab closed keeps player online', async () => {
        const lobby = await openLobby();
        const alice = await joinPlayer(lobby.pin, 'Alice');
        const execute = vi.spyOn(service, 'execute');

        const secondTab = await track(connectPlayer(ctx.url));
        const snapshot = nextState(secondTab, 'player:state');
        expectOk(
            await secondTab.emitWithAck('player:rejoin', { gameId: lobby.gameId, playerToken: alice.playerToken }),
        );
        expect((await snapshot).me.id).toBe(alice.playerId);
        secondTab.close();
        await sleep(SETTLE_MS);
        expect(connectionCommands(execute)).toEqual([]);
        expect((await current(store, lobby.gameId)).players[alice.playerId]?.connected).toBe(true);

        const offline = nextState(
            lobby.hostSocket,
            'host:state',
            (v) => playerIn(v, alice.playerId)?.connected === false,
        );
        alice.socket.close();
        await offline;
        await sleep(SETTLE_MS);
        expect(connectionCommands(execute)).toEqual([
            { type: 'player_connection', playerId: alice.playerId, connected: false },
        ]);
    });

    it('second tab closed keeps host online', async () => {
        const lobby = await openLobby();
        const alice = await joinPlayer(lobby.pin, 'Alice');
        await hostCommand(lobby, 'host:start', 'question_open', 0);
        const execute = vi.spyOn(service, 'execute');

        const secondTab = await track(connectHost(ctx.url, cookieOf(lobby.host.client)));
        const snapshot = nextState(secondTab, 'host:state');
        expectOk(await secondTab.emitWithAck('host:join', { gameId: lobby.gameId }));
        expect((await snapshot).phase).toBe('question_open');
        secondTab.close();
        await sleep(SETTLE_MS);
        // Every host_connection false restarts the 30-minute absence window, so nothing may be sent here.
        expect(connectionCommands(execute)).toEqual([]);
        expect(await current(store, lobby.gameId)).toMatchObject({ hostConnected: true, pause: null });

        const paused = nextState(alice.socket, 'player:state', (v) => v.pause !== null);
        lobby.hostSocket.close();
        await paused;
        await sleep(SETTLE_MS);
        expect(connectionCommands(execute)).toEqual([{ type: 'host_connection', connected: false }]);
    });

    it('two host tabs dropped together send one host_connection false', async () => {
        const lobby = await openLobby();
        const alice = await joinPlayer(lobby.pin, 'Alice');
        await hostCommand(lobby, 'host:start', 'question_open', 0);
        const secondTab = await track(connectHost(ctx.url, cookieOf(lobby.host.client)));
        expectOk(await secondTab.emitWithAck('host:join', { gameId: lobby.gameId }));
        const execute = vi.spyOn(service, 'execute');

        const paused = nextState(alice.socket, 'player:state', (v) => v.pause !== null);
        // Dropped server-side in one go, both disconnect handlers run before either presence check does.
        ctx.app.get(GameGateway)['nsp'].in(`game:${lobby.gameId}:host`).disconnectSockets(true);
        await paused;
        await sleep(SETTLE_MS);
        expect(connectionCommands(execute)).toEqual([{ type: 'host_connection', connected: false }]);
    });

    it('host disconnect auto-pauses; players see pause.reason host_disconnected', async () => {
        const lobby = await openLobby();
        const alice = await joinPlayer(lobby.pin, 'Alice');
        await hostCommand(lobby, 'host:start', 'question_open', 0);
        const paused = nextState(alice.socket, 'player:state', (v) => v.pause !== null);
        lobby.hostSocket.close();
        const view = await paused;
        expect(view.pause).toEqual({ reason: 'host_disconnected' });
        expect(view.question).toBeNull();

        const back = await track(connectHost(ctx.url, cookieOf(lobby.host.client)));
        const snapshot = nextState(back, 'host:state');
        expectOk(await back.emitWithAck('host:join', { gameId: lobby.gameId }));
        // Coming back does not resume by itself; the host resumes explicitly.
        expect((await snapshot).pause).toEqual({ reason: 'host' });
        const resumed = nextState(alice.socket, 'player:state', (v) => v.pause === null);
        expectOk(await back.emitWithAck('host:resume', {}));
        expect((await resumed).phase).toBe('question_open');
    });

    it('player:join whose token cannot be issued leaves no ghost player', async () => {
        const lobby = await openLobby();
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        vi.spyOn(store, 'issuePlayerToken').mockRejectedValueOnce(new Error('redis hiccup'));
        const socket = await track(connectPlayer(ctx.url));
        expect(await socket.emitWithAck('player:join', { pin: lobby.pin, nickname: 'Ghost' })).toEqual({
            ok: false,
            code: 'INTERNAL_ERROR',
        });
        const state = await current(store, lobby.gameId);
        expect(state.players).toEqual({});
        // The nickname was never taken, so the same player can try again.
        const retry = await track(connectPlayer(ctx.url));
        expectOk(await retry.emitWithAck('player:join', { pin: lobby.pin, nickname: 'Ghost' }));
    });

    it('socket that drops in the middle of its join leaves no room entry and stays offline', async () => {
        const lobby = await openLobby();
        const alice = await joinPlayer(lobby.pin, 'Alice');
        const offline = nextState(
            lobby.hostSocket,
            'host:state',
            (v) => playerIn(v, alice.playerId)?.connected === false,
        );
        alice.socket.close();
        await offline;

        // Hold the rejoin after its token lookup started, drop the socket, then let the join finish.
        const lookup = store.playerIdByToken.bind(store);
        let reached = (): void => undefined;
        const lookupStarted = new Promise<void>((resolve) => {
            reached = resolve;
        });
        let release = (): void => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        vi.spyOn(store, 'playerIdByToken').mockImplementation(async (gameId, token) => {
            reached();
            await gate;
            return lookup(gameId, token);
        });
        const again = await track(connectPlayer(ctx.url));
        const socketId = again.id ?? '';
        void again
            .emitWithAck('player:rejoin', { gameId: lobby.gameId, playerToken: alice.playerToken })
            .catch(() => undefined);
        await lookupStarted;
        again.close();
        await sleep(SETTLE_MS);
        release();
        await sleep(SETTLE_MS);

        const rooms = ctx.app.get(GameGateway)['nsp'].adapter.rooms;
        expect([...rooms].filter(([, ids]) => ids.has(socketId)).map(([room]) => room)).toEqual([]);
        expect((await current(store, lobby.gameId)).players[alice.playerId]?.connected).toBe(false);
    });

    it('kicked player receives player:kicked and rejoin → KICKED', async () => {
        const lobby = await openLobby();
        const alice = await joinPlayer(lobby.pin, 'Alice');
        const kicked = new Promise<void>((resolve) => {
            alice.socket.once('player:kicked', () => {
                resolve();
            });
        });
        const gone = disconnected(alice.socket);
        const roster = nextState(lobby.hostSocket, 'host:state', (v) => v.players.length === 0);
        expectOk(await lobby.hostSocket.emitWithAck('host:kick', { playerId: alice.playerId }));
        await Promise.all([kicked, gone, roster]);

        const again = await track(connectPlayer(ctx.url));
        expect(
            await again.emitWithAck('player:rejoin', { gameId: lobby.gameId, playerToken: alice.playerToken }),
        ).toEqual({ ok: false, code: 'KICKED' });
    });

    it('foreign host → NOT_HOST, player cannot send host:next → FORBIDDEN', async () => {
        const lobby = await openLobby();
        const alice = await joinPlayer(lobby.pin, 'Alice');
        const other = await registerHost(ctx.url, 'other');
        const foreign = await track(connectHost(ctx.url, cookieOf(other)));
        expect(await foreign.emitWithAck('host:join', { gameId: lobby.gameId })).toEqual({
            ok: false,
            code: 'NOT_HOST',
        });
        expect(await foreign.emitWithAck('host:start', {})).toEqual({ ok: false, code: 'FORBIDDEN' });

        const anonymous = await track(connectPlayer(ctx.url));
        expect(await anonymous.emitWithAck('host:join', { gameId: lobby.gameId })).toEqual({
            ok: false,
            code: 'UNAUTHENTICATED',
        });
        expect(await alice.socket.emitWithAck('host:next', {})).toEqual({ ok: false, code: 'FORBIDDEN' });
        expect(await alice.socket.emitWithAck('host:start', {})).toEqual({ ok: false, code: 'FORBIDDEN' });
        expect(
            await lobby.hostSocket.emitWithAck('player:answer', {
                questionIndex: 0,
                answer: { kind: 'option', option: 0 },
            }),
        ).toEqual({ ok: false, code: 'FORBIDDEN' });
        expect(await alice.socket.emitWithAck('player:join', { pin: lobby.pin, nickname: 'Twin' })).toEqual({
            ok: false,
            code: 'FORBIDDEN',
        });
        const fresh = await track(connectPlayer(ctx.url));
        const [first, second] = await Promise.all([
            fresh.emitWithAck('player:join', { pin: lobby.pin, nickname: 'Bob' }),
            fresh.emitWithAck('player:join', { pin: lobby.pin, nickname: 'Carol' }),
        ]);
        expect([codeOf(first), codeOf(second)]).toEqual(['ok', 'FORBIDDEN']);
        const state = await current(store, lobby.gameId);
        expect(state.phase).toBe('lobby');
        expect(state.playerOrder).toHaveLength(2);
    });

    it('answer received before the deadline but processed after it (lock contention) counts from receipt', async () => {
        const lobby = await openLobby();
        const alice = await joinPlayer(lobby.pin, 'Alice');
        await hostCommand(lobby, 'host:start', 'question_open', 0);
        const open = await current(store, lobby.gameId);
        const openedAt = open.question?.openedAt ?? 0;
        const closesAt = open.question?.closesAt ?? 0;
        clock.advance(closesAt - 1 - clock.now());
        // Something else holds the game's lock while the answer arrives.
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const held = service.withState(lobby.gameId, () => gate);
        const ack = alice.socket.emitWithAck('player:answer', {
            questionIndex: 0,
            answer: { kind: 'option', option: 0 },
        });
        await sleep(SETTLE_MS);
        clock.advance(5000); // processing happens well after closesAt
        release();
        await held;
        expect(codeOf(await ack)).toBe('ok');
        const state = await current(store, lobby.gameId);
        expect(state.answers[0]?.[alice.playerId]?.activeMs).toBe(closesAt - 1 - openedAt);
    });

    describe('handshake origin check', () => {
        const PUBLIC = 'http://localhost:8080'; // PUBLIC_BASE_URL of the test app

        const attempt = async (headers: Record<string, string>): Promise<'connected' | 'refused'> => {
            try {
                await track(connectWithHeaders(ctx.url, headers));
                return 'connected';
            } catch {
                return 'refused';
            }
        };

        it('accepts PUBLIC_BASE_URL, the Host the browser used, and no Origin; refuses other sites', async () => {
            const direct = new URL(ctx.url).host;
            expect(await attempt({})).toBe('connected');
            expect(await attempt({ origin: PUBLIC })).toBe('connected');
            expect(await attempt({ origin: `http://${direct}` })).toBe('connected');
            expect(await attempt({ origin: 'http://evil.example' })).toBe('refused');
            expect(await attempt({ origin: 'not a url' })).toBe('refused');
        });

        it('behind a proxy: accepts the X-Forwarded-Host the browser used, port included', async () => {
            // The laptop opens http://localhost:8081 while PUBLIC_BASE_URL is another address, and the proxy
            // replaced Host (dropping the port).
            const proxied = { origin: 'http://localhost:8081', host: 'localhost' };
            expect(await attempt(proxied)).toBe('refused');
            expect(await attempt({ ...proxied, 'x-forwarded-host': 'localhost:8081' })).toBe('connected');
            expect(await attempt({ ...proxied, 'x-forwarded-host': 'localhost:8081, inner-proxy:80' })).toBe(
                'connected',
            );
            // Strict: another port or another host is not the same origin.
            expect(await attempt({ ...proxied, 'x-forwarded-host': 'localhost:9999' })).toBe('refused');
            expect(await attempt({ ...proxied, 'x-forwarded-host': 'evil.example:8081' })).toBe('refused');
            // A proxy that keeps the port in Host (`proxy_set_header Host $http_host`) needs no extra header.
            expect(await attempt({ origin: 'http://localhost:8081', host: 'localhost:8081' })).toBe('connected');
        });
    });

    it('11 events in burst → last RATE_LIMITED', async () => {
        const socket = await track(connectPlayer(ctx.url));
        const acks = await Promise.all(Array.from({ length: 11 }, () => socket.emitWithAck('host:start', {})));
        expect(acks.map(codeOf)).toEqual([...Array<string>(10).fill('FORBIDDEN'), 'RATE_LIMITED']);
    });

    it('invalid payload → INVALID_PAYLOAD', async () => {
        const lobby = await openLobby();
        const socket = await track(connectPlayer(ctx.url));
        const join = (payload: unknown) =>
            socket.emitWithAck('player:join', payload as { pin: string; nickname: string });
        expect(codeOf(await join({ pin: '12ab', nickname: 'Alice' }))).toBe('INVALID_PAYLOAD');
        expect(codeOf(await join({ pin: lobby.pin, nickname: '   ' }))).toBe('INVALID_PAYLOAD');
        expect(codeOf(await join({ pin: lobby.pin, nickname: 'x'.repeat(21) }))).toBe('INVALID_PAYLOAD');
        expect(codeOf(await join(null))).toBe('INVALID_PAYLOAD');
        expect(
            codeOf(
                await socket.emitWithAck('player:answer', {
                    questionIndex: 0,
                    answer: { kind: 'option', option: 7 },
                }),
            ),
        ).toBe('INVALID_PAYLOAD');
    });

    it('unknown PIN → GAME_NOT_FOUND, unknown token → INVALID_TOKEN', async () => {
        const lobby = await openLobby();
        let pin = '000000';
        while ((await store.gameIdByPin(pin)) !== null) pin = String(Number(pin) + 1).padStart(6, '0');
        const socket = await track(connectPlayer(ctx.url));
        expect(await socket.emitWithAck('player:join', { pin, nickname: 'Alice' })).toEqual({
            ok: false,
            code: 'GAME_NOT_FOUND',
        });
        expect(await socket.emitWithAck('player:rejoin', { gameId: lobby.gameId, playerToken: 'nope' })).toEqual({
            ok: false,
            code: 'INVALID_TOKEN',
        });
    });

    describe('player:lookup', () => {
        it('player:lookup returns quizTitle for lobby', async () => {
            const lobby = await openLobby();
            const socket = await track(connectPlayer(ctx.url));
            const res = expectOk(await socket.emitWithAck('player:lookup', { pin: lobby.pin }));
            expect(res.quizTitle).toBe(sampleQuiz().title);
        });

        it('lookup after start → GAME_ALREADY_STARTED', async () => {
            const lobby = await openLobby();
            await joinPlayer(lobby.pin, 'Alice');
            await hostCommand(lobby, 'host:start', 'question_open', 0);
            const socket = await track(connectPlayer(ctx.url));
            expect(await socket.emitWithAck('player:lookup', { pin: lobby.pin })).toEqual({
                ok: false,
                code: 'GAME_ALREADY_STARTED',
            });
        });

        it('unknown pin → GAME_NOT_FOUND, malformed pin → INVALID_PAYLOAD', async () => {
            await openLobby();
            let pin = '000000';
            while ((await store.gameIdByPin(pin)) !== null) pin = String(Number(pin) + 1).padStart(6, '0');
            const socket = await track(connectPlayer(ctx.url));
            expect(await socket.emitWithAck('player:lookup', { pin })).toEqual({ ok: false, code: 'GAME_NOT_FOUND' });
            expect(codeOf(await socket.emitWithAck('player:lookup', { pin: '12ab' }))).toBe('INVALID_PAYLOAD');
        });

        it('full game → GAME_FULL', async () => {
            const lobby = await openLobby();
            for (let i = 0; i < 50; i++) {
                const r = await service.execute(lobby.gameId, {
                    type: 'player_join',
                    playerId: `p${String(i)}`,
                    nickname: `Player ${String(i)}`,
                });
                expect(r.ok).toBe(true);
            }
            const socket = await track(connectPlayer(ctx.url));
            expect(await socket.emitWithAck('player:lookup', { pin: lobby.pin })).toEqual({
                ok: false,
                code: 'GAME_FULL',
            });
        });

        it('lookup does not bind socket', async () => {
            const lobby = await openLobby();
            const socket = await track(connectPlayer(ctx.url));
            expectOk(await socket.emitWithAck('player:lookup', { pin: lobby.pin }));
            expect(
                codeOf(
                    await socket.emitWithAck('player:answer', {
                        questionIndex: 0,
                        answer: { kind: 'option', option: 0 },
                    }),
                ),
            ).toBe('FORBIDDEN');
            const snapshot = nextState(socket, 'player:state');
            const ack = expectOk(await socket.emitWithAck('player:join', { pin: lobby.pin, nickname: 'Alice' }));
            expect(await snapshot).toMatchObject({ phase: 'lobby', me: { id: ack.playerId }, playerCount: 1 });
        });
    });
});
