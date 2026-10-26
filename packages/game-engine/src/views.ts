import type {
    Countdown,
    HostPlayerView,
    HostView,
    LeaderboardEntry,
    PlayerView,
    QuestionPublic,
    QuestionResults,
} from '@quizpulse/protocol';
import { rankPlayers } from './ranking.js';
import type { GameState, PlayerState, QuestionSnapshot, ScoredAnswer } from './types.js';

type ImageUrl = (imageId: string) => string;

const HOST_LEADERBOARD_SIZE = 10;
const PODIUM_SIZE = 3;
const CLOSEST_NUMERIC_SIZE = 3;

const activePlayers = (s: GameState): PlayerState[] =>
    s.playerOrder.map((id) => s.players[id]).filter((p): p is PlayerState => p !== undefined && !p.kicked);

const currentQuestion = (s: GameState): QuestionSnapshot | undefined => s.quiz.questions[s.questionIndex];

const showsQuestion = (s: GameState): boolean =>
    s.pause === null && (s.phase === 'question_open' || s.phase === 'question_results' || s.phase === 'leaderboard');

const hasAnswers = (s: GameState): boolean => s.phase === 'question_open' || s.phase === 'question_results';

const currentAnswers = (s: GameState): Record<string, ScoredAnswer> =>
    hasAnswers(s) ? (s.answers[s.questionIndex] ?? {}) : {};

function questionPublic(s: GameState, imageUrl: ImageUrl): QuestionPublic | null {
    const q = currentQuestion(s);
    if (!q || !showsQuestion(s)) return null;
    return {
        index: q.index,
        type: q.type,
        text: q.text,
        imageUrl: q.imageId === null ? null : imageUrl(q.imageId),
        options: q.type === 'true_false' ? [] : [...q.options],
        timeLimitSeconds: q.timeLimitSeconds,
        multiplier: q.multiplier,
    };
}

function countdown(s: GameState, now: number): Countdown | null {
    if (s.phase !== 'question_open' || !s.question) return null;
    const { closesAt, remainingMsAtPause } = s.question;
    const remainingMs = s.pause ? (remainingMsAtPause ?? 0) : Math.max(0, (closesAt ?? now) - now);
    return { closesAt, remainingMs, serverNow: now };
}

function autoAdvance(s: GameState, now: number): Countdown | null {
    if (s.pause || s.advanceAt == null) return null;
    if (s.quiz.settings.advanceMode !== 'auto') return null;
    if (s.phase !== 'question_results' && s.phase !== 'leaderboard') return null;
    return { closesAt: s.advanceAt, remainingMs: Math.max(0, s.advanceAt - now), serverNow: now };
}

function results(s: GameState): QuestionResults | null {
    const q = currentQuestion(s);
    if (s.phase !== 'question_results' || !q) return null;
    const answers = Object.values(currentAnswers(s)).filter((a) => s.players[a.playerId]?.kicked === false);
    const optionCounts =
        q.type === 'numeric'
            ? null
            : Array.from(
                  { length: q.type === 'true_false' ? 2 : q.options.length },
                  (_, i) => answers.filter((a) => a.answer.kind === 'option' && a.answer.option === i).length,
              );
    const closestNumeric =
        q.type === 'numeric' && q.numericAnswer !== null
            ? answers
                  .flatMap((a) => (a.answer.kind === 'numeric' ? [{ a, value: a.answer.value }] : []))
                  .sort(
                      (x, y) =>
                          Math.abs(x.value - (q.numericAnswer ?? 0)) - Math.abs(y.value - (q.numericAnswer ?? 0)) ||
                          x.a.activeMs - y.a.activeMs,
                  )
                  .slice(0, CLOSEST_NUMERIC_SIZE)
                  .map(({ a, value }) => ({ nickname: s.players[a.playerId]?.nickname ?? '', value }))
            : null;
    return {
        correctOption: q.correctOption,
        numericAnswer: q.numericAnswer,
        numericTolerance: q.numericTolerance,
        optionCounts,
        closestNumeric,
        noAnswerCount: activePlayers(s).length - answers.length,
    };
}

function ranking(s: GameState): LeaderboardEntry[] {
    return rankPlayers(
        activePlayers(s).map((p) => ({
            playerId: p.id,
            nickname: p.nickname,
            score: p.score,
            correctMs: p.correctMs,
            joinedAt: p.joinedAt,
        })),
    ).map(({ playerId, nickname, score, rank }) => ({ playerId, nickname, score, rank }));
}

export function toHostView(s: GameState, now: number, imageUrl: ImageUrl): HostView {
    const answers = currentAnswers(s);
    const players: HostPlayerView[] = activePlayers(s).map((p) => ({
        id: p.id,
        nickname: p.nickname,
        connected: p.connected,
        score: p.score,
        answered: p.id in answers,
    }));
    let leaderboard: LeaderboardEntry[] | null = null;
    if (s.phase === 'leaderboard') leaderboard = ranking(s).slice(0, HOST_LEADERBOARD_SIZE);
    else if (s.phase === 'finished') leaderboard = ranking(s);
    return {
        gameId: s.gameId,
        pin: s.pin,
        joinUrl: s.joinUrl,
        phase: s.phase,
        pause: s.pause ? { reason: s.pause.reason } : null,
        quizTitle: s.quiz.title,
        questionIndex: s.questionIndex,
        questionCount: s.quiz.questions.length,
        question: questionPublic(s, imageUrl),
        countdown: countdown(s, now),
        answeredCount: players.filter((p) => p.answered).length,
        players,
        results: results(s),
        leaderboard,
        outcome: s.outcome,
        advanceMode: s.quiz.settings.advanceMode,
        autoAdvance: autoAdvance(s, now),
    };
}

export function toPlayerView(s: GameState, playerId: string, now: number, imageUrl: ImageUrl): PlayerView {
    const me = s.players[playerId];
    if (!me) throw new Error(`unknown player ${playerId}`);
    const board = ranking(s);
    const showRank = s.phase === 'leaderboard' || s.phase === 'finished';
    const mine = currentAnswers(s)[playerId];
    let myResult: PlayerView['myResult'] = null;
    if (s.phase === 'question_results') myResult = { correct: mine?.correct ?? false, points: mine?.points ?? 0 };
    return {
        phase: s.phase,
        pause: s.pause ? { reason: s.pause.reason } : null,
        quizTitle: s.quiz.title,
        questionIndex: s.questionIndex,
        questionCount: s.quiz.questions.length,
        question: questionPublic(s, imageUrl),
        countdown: countdown(s, now),
        me: {
            id: me.id,
            nickname: me.nickname,
            score: me.score,
            rank: showRank ? (board.find((e) => e.playerId === playerId)?.rank ?? null) : null,
        },
        answered: mine !== undefined,
        myAnswer: showsQuestion(s) && hasAnswers(s) ? (mine?.answer ?? null) : null,
        playerCount: activePlayers(s).length,
        myResult,
        podium: s.phase === 'finished' ? board.slice(0, PODIUM_SIZE) : null,
        outcome: s.outcome,
    };
}
