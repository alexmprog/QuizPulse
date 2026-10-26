import { HOST_ABSENT_MS, MAX_PLAYERS, NICKNAME_MAX } from '@quizpulse/protocol';
import type { ErrorCode, GameOutcome, PlayerAnswer } from '@quizpulse/protocol';
import { normalizeNickname } from './nickname.js';
import { scoreQuestion } from './scoring.js';
import type { Command, Effect, GameState, PlayerState, QuestionSnapshot, ReduceResult, ScoredAnswer } from './types.js';

type Handled = { ok: true; effects: Effect[] } | { ok: false; code: ErrorCode };
/** Handlers mutate the (already cloned) draft state and report effects or an error. */
type Handler<C extends Command> = (s: GameState, cmd: C, now: number) => Handled;

const fail = (code: ErrorCode): Handled => ({ ok: false, code });
const done = (effects: Effect[] = []): Handled => ({ ok: true, effects });

/**
 * A new lobby and the effects to carry out with it. The host counts as offline until their first socket
 * arrives, so the absence timer already runs: a lobby nobody ever opens closes after `HOST_ABSENT_MS`.
 */
export function createGame(init: {
    gameId: string;
    hostId: string;
    pin: string;
    joinUrl: string;
    quiz: GameState['quiz'];
    now: number;
}): { state: GameState; effects: Effect[] } {
    const state: GameState = {
        gameId: init.gameId,
        hostId: init.hostId,
        pin: init.pin,
        joinUrl: init.joinUrl,
        quiz: init.quiz,
        createdAt: init.now,
        phase: 'lobby',
        questionIndex: -1,
        pause: null,
        question: null,
        players: {},
        playerOrder: [],
        answers: {},
        hostConnected: false,
        outcome: null,
        advanceAt: null,
        hostAbsentAt: init.now + HOST_ABSENT_MS,
        timerEpoch: 0,
        hostEpoch: 0,
    };
    const effects: Effect[] = [
        { type: 'schedule', timer: 'host_absent', epoch: state.hostEpoch, at: init.now + HOST_ABSENT_MS },
    ];
    return { state, effects };
}

const activePlayers = (s: GameState): PlayerState[] =>
    s.playerOrder.map((id) => s.players[id]).filter((p): p is PlayerState => p !== undefined && !p.kicked);

function currentQuestion(s: GameState): QuestionSnapshot | undefined {
    return s.quiz.questions[s.questionIndex];
}

// ---------- question lifecycle ----------

function openQuestion(s: GameState, index: number, now: number): Effect[] {
    const q = s.quiz.questions[index];
    if (!q) throw new Error(`question ${String(index)} does not exist`);
    const closesAt = now + q.timeLimitSeconds * 1000;
    s.phase = 'question_open';
    s.questionIndex = index;
    s.timerEpoch += 1;
    s.advanceAt = null;
    s.question = { openedAt: now, pausedMs: 0, closesAt, remainingMsAtPause: null };
    s.answers[index] = {};
    return [{ type: 'schedule', timer: 'question_deadline', epoch: s.timerEpoch, at: closesAt }];
}

function scheduleAutoAdvance(s: GameState, now: number): Effect[] {
    if (s.quiz.settings.advanceMode !== 'auto') return [];
    const at = now + s.quiz.settings.autoAdvanceSeconds * 1000;
    s.advanceAt = at;
    return [{ type: 'schedule', timer: 'auto_advance', epoch: s.timerEpoch, at }];
}

function closeQuestion(s: GameState, now: number): Effect[] {
    const q = currentQuestion(s);
    const recorded = s.answers[s.questionIndex] ?? {};
    if (!q) throw new Error('no current question');
    const scored = scoreQuestion(
        q,
        Object.values(recorded).map(({ playerId, answer, activeMs }) => ({ playerId, answer, activeMs })),
    );
    const byPlayer: Record<string, ScoredAnswer> = {};
    for (const a of scored) {
        byPlayer[a.playerId] = a;
        const player = s.players[a.playerId];
        if (!player) continue;
        player.score += a.points;
        if (a.correct) player.correctMs += a.activeMs;
    }
    s.answers[s.questionIndex] = byPlayer;
    s.phase = 'question_results';
    s.timerEpoch += 1;
    s.question = null;
    return scheduleAutoAdvance(s, now);
}

function finish(s: GameState, outcome: GameOutcome = 'completed'): Effect[] {
    // A question still open is never scored, so its answers are dropped: the finished state is the history.
    if (s.phase === 'question_open') {
        const open = s.questionIndex;
        s.answers = Object.fromEntries(Object.entries(s.answers).filter(([index]) => Number(index) !== open));
    }
    s.phase = 'finished';
    s.outcome = outcome;
    s.question = null;
    s.pause = null;
    s.advanceAt = null;
    s.timerEpoch += 1;
    s.hostEpoch += 1;
    s.hostAbsentAt = null;
    return [{ type: 'persist_history' }];
}

/** Moves on from question_results or leaderboard. */
function advance(s: GameState, now: number): Effect[] {
    const last = s.questionIndex >= s.quiz.questions.length - 1;
    if (s.phase === 'question_results') {
        if (last) return finish(s);
        const every = s.quiz.settings.leaderboardEvery;
        if (every > 0 && (s.questionIndex + 1) % every === 0) {
            s.phase = 'leaderboard';
            s.timerEpoch += 1;
            return scheduleAutoAdvance(s, now);
        }
    }
    return openQuestion(s, s.questionIndex + 1, now);
}

function everyoneAnswered(s: GameState): boolean {
    const answers = s.answers[s.questionIndex] ?? {};
    const connected = activePlayers(s).filter((p) => p.connected);
    // With nobody connected there is nobody to wait for, but closing instantly would skip the question; keep it open.
    return connected.length > 0 && connected.every((p) => p.id in answers);
}

function maybeEarlyClose(s: GameState, now: number): Effect[] {
    if (s.phase !== 'question_open' || s.pause || !s.quiz.settings.earlyClose) return [];
    return everyoneAnswered(s) ? closeQuestion(s, now) : [];
}

function validAnswerShape(q: QuestionSnapshot, a: PlayerAnswer): boolean {
    if (q.type === 'numeric') return a.kind === 'numeric' && Number.isFinite(a.value);
    if (a.kind !== 'option' || !Number.isInteger(a.option) || a.option < 0) return false;
    return a.option < (q.type === 'true_false' ? 2 : q.options.length);
}

// ---------- command handlers ----------

const playerJoin: Handler<Extract<Command, { type: 'player_join' }>> = (s, cmd, now) => {
    if (s.phase !== 'lobby') return fail('GAME_ALREADY_STARTED');
    const nickname = normalizeNickname(cmd.nickname);
    if (nickname === '' || nickname.length > NICKNAME_MAX || cmd.playerId in s.players) return fail('INVALID_PAYLOAD');
    const active = activePlayers(s);
    const lower = nickname.toLowerCase();
    if (active.length >= MAX_PLAYERS) return fail('GAME_FULL');
    if (active.some((p) => p.nickname.toLowerCase() === lower)) return fail('NICKNAME_TAKEN');
    s.players[cmd.playerId] = {
        id: cmd.playerId,
        nickname,
        joinedAt: now,
        connected: true,
        kicked: false,
        score: 0,
        correctMs: 0,
    };
    s.playerOrder.push(cmd.playerId);
    return done();
};

const playerConnection: Handler<Extract<Command, { type: 'player_connection' }>> = (s, cmd, now) => {
    const p = s.players[cmd.playerId];
    if (!p) return fail('INVALID_PAYLOAD');
    if (p.kicked) return done();
    p.connected = cmd.connected;
    return done(maybeEarlyClose(s, now));
};

const kick: Handler<Extract<Command, { type: 'kick' }>> = (s, cmd) => {
    if (s.phase !== 'lobby') return fail('INVALID_PHASE');
    const p = s.players[cmd.playerId];
    if (!p) return fail('INVALID_PAYLOAD');
    if (p.kicked) return done();
    p.kicked = true;
    p.connected = false;
    return done([{ type: 'notify_kicked', playerId: p.id }]);
};

const start: Handler<Extract<Command, { type: 'start' }>> = (s, _cmd, now) => {
    if (s.phase !== 'lobby') return fail('INVALID_PHASE');
    if (activePlayers(s).length === 0) return fail('NO_PLAYERS');
    return done(openQuestion(s, 0, now));
};

const next: Handler<Extract<Command, { type: 'next' }>> = (s, _cmd, now) => {
    if (s.pause) return fail('PAUSED');
    if (s.phase !== 'question_results' && s.phase !== 'leaderboard') return fail('INVALID_PHASE');
    return done(advance(s, now));
};

const answer: Handler<Extract<Command, { type: 'answer' }>> = (s, cmd, now) => {
    // A late answer gets one code whether or not the deadline timer has closed the question yet.
    const closed = s.phase === 'question_results' || s.phase === 'leaderboard';
    if (closed && cmd.questionIndex <= s.questionIndex) return fail('QUESTION_CLOSED');
    if (s.phase !== 'question_open' || !s.question) return fail('INVALID_PHASE');
    if (s.pause) return fail('PAUSED');
    const { closesAt, openedAt, pausedMs } = s.question;
    // Stamped on receipt, so time spent waiting for the game's lock neither costs points nor misses the deadline.
    const at = Math.min(cmd.receivedAt ?? now, now);
    if (cmd.questionIndex !== s.questionIndex || closesAt === null || at >= closesAt) return fail('QUESTION_CLOSED');
    const player = s.players[cmd.playerId];
    if (!player) return fail('INVALID_PAYLOAD');
    if (player.kicked) return fail('KICKED');
    const recorded = (s.answers[s.questionIndex] ??= {});
    if (cmd.playerId in recorded) return fail('ALREADY_ANSWERED');
    const q = currentQuestion(s);
    if (!q || !validAnswerShape(q, cmd.answer)) return fail('INVALID_PAYLOAD');
    recorded[cmd.playerId] = {
        playerId: cmd.playerId,
        answer: cmd.answer,
        activeMs: Math.max(0, at - openedAt - pausedMs),
        points: 0,
        correct: false,
    };
    return done(maybeEarlyClose(s, now));
};

const timerFired: Handler<Extract<Command, { type: 'timer_fired' }>> = (s, cmd, now) => {
    const current = cmd.timer === 'host_absent' ? s.hostEpoch : s.timerEpoch;
    if (cmd.epoch !== current) return done();
    switch (cmd.timer) {
        case 'question_deadline':
            if (s.phase !== 'question_open' || s.pause) return done();
            // Defence in depth: never close before the deadline, whatever the epoch says.
            if (s.question?.closesAt == null || now < s.question.closesAt) return done();
            return done(closeQuestion(s, now));
        case 'auto_advance':
            if ((s.phase !== 'question_results' && s.phase !== 'leaderboard') || s.pause) return done();
            return done(advance(s, now));
        case 'host_absent':
            if (s.phase === 'lobby') return done([{ type: 'close_lobby' }]);
            if (s.phase === 'finished') return done();
            return done(finish(s, 'aborted'));
    }
};

const canPause = (s: GameState): boolean =>
    s.phase === 'question_open' || s.phase === 'question_results' || s.phase === 'leaderboard';

/** Freezes the current phase. Callers must have checked canPause and that no pause exists. */
function applyPause(s: GameState, reason: 'host' | 'host_disconnected', now: number): void {
    if (s.phase === 'question_open' && s.question?.closesAt != null) {
        s.question.remainingMsAtPause = Math.max(0, s.question.closesAt - now);
        s.question.closesAt = null;
    }
    s.advanceAt = null;
    s.timerEpoch += 1; // invalidates the pending deadline / auto_advance timer
    s.pause = { reason, since: now };
}

const pause: Handler<Extract<Command, { type: 'pause' }>> = (s, _cmd, now) => {
    if (!canPause(s)) return fail('INVALID_PHASE');
    if (s.pause) return fail('PAUSED');
    applyPause(s, 'host', now);
    return done();
};

const resume: Handler<Extract<Command, { type: 'resume' }>> = (s, _cmd, now) => {
    if (!s.pause || !canPause(s)) return fail('INVALID_PHASE');
    const { since } = s.pause;
    s.pause = null;
    s.timerEpoch += 1;
    if (s.phase === 'question_open' && s.question) {
        const remaining = s.question.remainingMsAtPause ?? 0;
        s.question.pausedMs += now - since;
        s.question.closesAt = now + remaining;
        s.question.remainingMsAtPause = null;
        const deadline: Effect = {
            type: 'schedule',
            timer: 'question_deadline',
            epoch: s.timerEpoch,
            at: s.question.closesAt,
        };
        // Players may have disconnected during the pause; the deadline timer goes stale if this closes the question.
        return done([deadline, ...maybeEarlyClose(s, now)]);
    }
    return done(scheduleAutoAdvance(s, now));
};

const hostConnection: Handler<Extract<Command, { type: 'host_connection' }>> = (s, cmd, now) => {
    if (s.phase === 'finished') return done();
    s.hostConnected = cmd.connected;
    s.hostEpoch += 1;
    if (cmd.connected) {
        s.hostAbsentAt = null;
        // The pause stays until the host resumes explicitly.
        if (s.pause?.reason === 'host_disconnected') s.pause.reason = 'host';
        return done();
    }
    if (canPause(s) && !s.pause) applyPause(s, 'host_disconnected', now);
    // A pause the host made by hand now tells players that the host is gone; it turns back to `host` on return.
    else if (s.pause?.reason === 'host') s.pause.reason = 'host_disconnected';
    s.hostAbsentAt = now + HOST_ABSENT_MS;
    return done([{ type: 'schedule', timer: 'host_absent', epoch: s.hostEpoch, at: s.hostAbsentAt }]);
};

const end: Handler<Extract<Command, { type: 'end' }>> = (s) => {
    if (s.phase === 'finished') return fail('INVALID_PHASE');
    if (s.phase === 'lobby') return done([{ type: 'close_lobby' }]);
    return done(finish(s, 'aborted')); // an open question is deliberately not scored
};

/**
 * The timer the state is waiting for, re-derived from the state itself (e.g. after a restart, in case a job was
 * lost). Scheduling is idempotent per timer and epoch, so re-scheduling a job that still exists is harmless.
 */
export function pendingTimers(s: GameState, now: number): Effect[] {
    if (s.phase === 'finished') return [];
    const effects: Effect[] = [];
    if (!s.pause && s.phase === 'question_open' && s.question?.closesAt != null) {
        effects.push({ type: 'schedule', timer: 'question_deadline', epoch: s.timerEpoch, at: s.question.closesAt });
    }
    if (!s.pause && (s.phase === 'question_results' || s.phase === 'leaderboard') && s.advanceAt != null) {
        effects.push({ type: 'schedule', timer: 'auto_advance', epoch: s.timerEpoch, at: s.advanceAt });
    }
    if (!s.hostConnected) {
        effects.push({
            type: 'schedule',
            timer: 'host_absent',
            epoch: s.hostEpoch,
            at: s.hostAbsentAt ?? now + HOST_ABSENT_MS,
        });
    }
    return effects;
}

export function reduce(state: GameState, cmd: Command, now: number): ReduceResult {
    const s = structuredClone(state);
    const result = dispatch(s, cmd, now);
    return result.ok ? { ok: true, state: s, effects: result.effects } : result;
}

function dispatch(s: GameState, cmd: Command, now: number): Handled {
    switch (cmd.type) {
        case 'player_join':
            return playerJoin(s, cmd, now);
        case 'player_connection':
            return playerConnection(s, cmd, now);
        case 'kick':
            return kick(s, cmd, now);
        case 'start':
            return start(s, cmd, now);
        case 'next':
            return next(s, cmd, now);
        case 'answer':
            return answer(s, cmd, now);
        case 'timer_fired':
            return timerFired(s, cmd, now);
        case 'host_connection':
            return hostConnection(s, cmd, now);
        case 'pause':
            return pause(s, cmd, now);
        case 'resume':
            return resume(s, cmd, now);
        case 'end':
            return end(s, cmd, now);
    }
}
