// Driver for tools/dev/smoke.sh: plays one complete game against a running API. Plain Node, no build step.
import { createRequire } from 'node:module';

// socket.io-client is a dev dependency of the API workspace package; resolve it from there.
const { io } = createRequire(new URL('../../apps/api/package.json', import.meta.url))('socket.io-client');

const API = process.env.API_URL ?? 'http://localhost:3000';
const TIMEOUT_MS = 60_000;

const log = (message) => console.log(`[smoke] ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message) => {
    throw new Error(message);
};

/** Minimal cookie-keeping client that follows the CSRF protocol of the real web client. */
class Client {
    cookies = new Map();
    csrf = null;

    async request(method, path, body) {
        const headers = { 'content-type': 'application/json' };
        if (this.cookies.size > 0) headers.cookie = this.cookieHeader();
        if (this.csrf && method !== 'GET') headers['x-csrf-token'] = this.csrf;
        const res = await fetch(`${API}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        for (const line of res.headers.getSetCookie()) {
            const [pair] = line.split(';');
            const eq = pair.indexOf('=');
            this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
        }
        const rotated = res.headers.get('x-csrf-token');
        if (rotated) this.csrf = rotated;
        return res;
    }

    cookieHeader() {
        return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }

    async json(method, path, body, expected) {
        const res = await this.request(method, path, body);
        if (res.status !== expected)
            fail(`${method} ${path} -> ${res.status}, expected ${expected}: ${await res.text()}`);
        return res.json();
    }
}

function connect(headers = {}) {
    const socket = io(`${API}/game`, { transports: ['websocket'], extraHeaders: headers, reconnection: false });
    return new Promise((resolve, reject) => {
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
    });
}

async function emit(socket, event, payload) {
    const res = await socket.timeout(5000).emitWithAck(event, payload);
    if (!res.ok) fail(`${event} refused: ${res.code}`);
    return res;
}

async function main() {
    const host = new Client();
    const { token } = await host.json('GET', '/api/v1/auth/csrf', undefined, 200);
    host.csrf = token;
    const email = `smoke-${Date.now()}@example.test`;
    await host.json('POST', '/api/v1/auth/register', { email, password: 'smoke-test-password' }, 201);
    log(`registered ${email}`);

    const packs = await host.json('GET', '/api/v1/packs?language=en', undefined, 200);
    const pack = packs[0] ?? fail('no built-in packs');
    const quiz = await host.json('POST', `/api/v1/packs/${pack.id}/copy`, undefined, 201);
    log(`copied pack "${quiz.title}" (${quiz.questions.length} questions)`);

    const created = await host.json('POST', '/api/v1/games', { quizId: quiz.id }, 201);
    log(`game ${created.gameId}, PIN ${created.pin}`);

    const hostSocket = await connect({ cookie: host.cookieHeader() });

    // Sockets and handlers first: a state is pushed on every change, and a late listener would miss the lobby.
    const players = [];
    for (const nickname of ['Smoke A', 'Smoke B']) players.push({ nickname, socket: await connect() });

    const finished = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`game did not finish within ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
        let handled = '';
        hostSocket.on('host:state', (view) => {
            if (view.phase === 'finished') {
                clearTimeout(timer);
                resolve(view);
                return;
            }
            const key = `${view.phase}:${view.questionIndex}`;
            if (key === handled) return;
            if (view.phase === 'lobby' && view.players.length === players.length) {
                handled = key;
                emit(hostSocket, 'host:start', {}).catch(reject);
            } else if (view.phase === 'question_results' || view.phase === 'leaderboard') {
                handled = key;
                // Sockets are rate limited (bucket of 10, refill 5/s), so pace the host like a person would.
                sleep(300)
                    .then(() => emit(hostSocket, 'host:next', {}))
                    .catch(reject);
            }
        });
        for (const { socket } of players) {
            let answered = -1;
            socket.on('player:state', (view) => {
                const question = view.question;
                if (view.phase !== 'question_open' || view.pause || view.answered || !question) return;
                if (answered === question.index) return;
                answered = question.index;
                const answer =
                    question.type === 'numeric' ? { kind: 'numeric', value: 0 } : { kind: 'option', option: 0 };
                sleep(100)
                    .then(() => emit(socket, 'player:answer', { questionIndex: question.index, answer }))
                    .catch(reject);
            });
        }
    });
    await emit(hostSocket, 'host:join', { gameId: created.gameId });
    for (const { nickname, socket } of players) await emit(socket, 'player:join', { pin: created.pin, nickname });
    log('two players joined');

    const final = await finished;
    log(
        `finished: outcome ${final.outcome}, podium ${final.leaderboard
            ?.slice(0, 3)
            .map((e) => e.nickname)
            .join(', ')}`,
    );

    hostSocket.close();
    for (const { socket } of players) socket.close();

    // The history row is written by the finish effect; allow for a short delay.
    let history = [];
    for (let attempt = 0; attempt < 20 && history.length === 0; attempt += 1) {
        history = await host.json('GET', '/api/v1/history', undefined, 200);
        if (history.length === 0) await sleep(250);
    }
    if (history.length !== 1) fail(`expected 1 game in history, got ${history.length}`);
    const [entry] = history;
    if (entry.gameId !== created.gameId || entry.status !== 'completed') {
        fail(`unexpected history entry: ${JSON.stringify(entry)}`);
    }
    log(`history: ${entry.quizTitle}, ${entry.status}, ${entry.playerCount} players, winner ${entry.winner?.nickname}`);
    console.log('SMOKE OK');
}

main().then(
    () => process.exit(0),
    (error) => {
        console.error(`SMOKE FAILED: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    },
);
