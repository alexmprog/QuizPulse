import { Inject, Injectable } from '@nestjs/common';
import type { components } from '@quizpulse/api-types';
import { type GameState, type QuizSnapshot, rankPlayers } from '@quizpulse/game-engine';
import type { PlayerAnswer } from '@quizpulse/protocol';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { gameAnswers, gamePlayers, games, quizzes } from '../db/schema.js';

export type GameSummary = components['schemas']['GameSummary'];
export type GameDetail = components['schemas']['GameDetail'];
type GameStatus = components['schemas']['GameStatus'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Finished games in Postgres: one `games` row with the quiz snapshot, its players and their answers. */
@Injectable()
export class HistoryService {
    constructor(
        @Inject(DB) private readonly db: Database,
        @Inject(CLOCK) private readonly clock: Clock,
    ) {}

    /** Saves a finished game once; later calls for the same game id change nothing. */
    async persist(state: GameState): Promise<void> {
        const players = rankPlayers(
            state.playerOrder.flatMap((id) => {
                const p = state.players[id];
                return p && !p.kicked
                    ? [
                          {
                              playerId: p.id,
                              nickname: p.nickname,
                              score: p.score,
                              correctMs: p.correctMs,
                              joinedAt: p.joinedAt,
                          },
                      ]
                    : [];
            }),
        );
        const included = new Set(players.map((p) => p.playerId));
        const answers = Object.entries(state.answers).flatMap(([index, byPlayer]) =>
            Object.values(byPlayer)
                .filter((a) => included.has(a.playerId))
                .map((a) => ({
                    gameId: state.gameId,
                    playerId: a.playerId,
                    questionIndex: Number(index),
                    answer: a.answer,
                    activeMs: Math.round(a.activeMs),
                    points: a.points,
                    correct: a.correct,
                })),
        );

        await this.db.transaction(async (tx) => {
            // Lock the quiz row (if it still exists) so a concurrent delete waits and then nulls quiz_id.
            const [quiz] = await tx
                .select({ id: quizzes.id })
                .from(quizzes)
                .where(eq(quizzes.id, state.quiz.quizId))
                .for('key share');
            const inserted = await tx
                .insert(games)
                .values({
                    id: state.gameId,
                    hostId: state.hostId,
                    quizId: quiz?.id ?? null,
                    quizTitle: state.quiz.title,
                    status: (state.outcome ?? 'aborted') satisfies GameStatus,
                    startedAt: new Date(state.createdAt),
                    endedAt: new Date(this.clock.now()),
                    quizSnapshot: state.quiz,
                })
                .onConflictDoNothing({ target: games.id })
                .returning({ id: games.id });
            if (inserted.length === 0) return;
            if (players.length > 0) {
                await tx.insert(gamePlayers).values(
                    players.map((p) => ({
                        id: p.playerId,
                        gameId: state.gameId,
                        nickname: p.nickname,
                        finalScore: p.score,
                        finalRank: p.rank,
                    })),
                );
            }
            if (answers.length > 0) await tx.insert(gameAnswers).values(answers);
        });
    }

    /** Whether the game has been saved already. */
    async has(gameId: string): Promise<boolean> {
        const rows = await this.db.select({ id: games.id }).from(games).where(eq(games.id, gameId)).limit(1);
        return rows.length > 0;
    }

    /** The host's games, newest first. */
    async list(hostId: string): Promise<GameSummary[]> {
        const rows = await this.db.select().from(games).where(eq(games.hostId, hostId)).orderBy(desc(games.startedAt));
        if (rows.length === 0) return [];
        const players = await this.db
            .select()
            .from(gamePlayers)
            .where(
                inArray(
                    gamePlayers.gameId,
                    rows.map((r) => r.id),
                ),
            );
        return rows.map((row) => {
            const own = players.filter((p) => p.gameId === row.id);
            const winner = own.find((p) => p.finalRank === 1);
            return {
                gameId: row.id,
                quizTitle: row.quizTitle,
                status: row.status as GameStatus,
                startedAt: row.startedAt.toISOString(),
                endedAt: (row.endedAt ?? row.startedAt).toISOString(),
                playerCount: own.length,
                winner: winner ? { nickname: winner.nickname, score: winner.finalScore } : null,
            };
        });
    }

    /** One game of the host with its quiz snapshot and answers; `404 NOT_FOUND` for unknown or foreign games. */
    async get(hostId: string, gameId: string): Promise<GameDetail> {
        if (!UUID.test(gameId)) throw new AppError('NOT_FOUND', 404);
        const [row] = await this.db
            .select()
            .from(games)
            .where(and(eq(games.id, gameId), eq(games.hostId, hostId)))
            .limit(1);
        if (!row) throw new AppError('NOT_FOUND', 404);
        const [players, answers] = await Promise.all([
            this.db
                .select()
                .from(gamePlayers)
                .where(eq(gamePlayers.gameId, gameId))
                .orderBy(asc(gamePlayers.finalRank)),
            this.db.select().from(gameAnswers).where(eq(gameAnswers.gameId, gameId)).orderBy(asc(gameAnswers.activeMs)),
        ]);
        const snapshot = row.quizSnapshot as QuizSnapshot;
        return {
            gameId: row.id,
            quizTitle: row.quizTitle,
            status: row.status as GameStatus,
            startedAt: row.startedAt.toISOString(),
            endedAt: (row.endedAt ?? row.startedAt).toISOString(),
            players: players.map((p) => ({
                playerId: p.id,
                nickname: p.nickname,
                finalScore: p.finalScore,
                finalRank: p.finalRank,
            })),
            questions: snapshot.questions.map((q) => ({
                position: q.index,
                type: q.type,
                text: q.text,
                options: q.options,
                correctOption: q.correctOption,
                numericAnswer: q.numericAnswer,
                numericTolerance: q.numericTolerance,
                multiplier: q.multiplier,
                answers: answers
                    .filter((a) => a.questionIndex === q.index)
                    .map((a) => ({
                        playerId: a.playerId,
                        answer: a.answer as PlayerAnswer,
                        activeMs: a.activeMs,
                        points: a.points,
                        correct: a.correct,
                    })),
            })),
        };
    }
}
