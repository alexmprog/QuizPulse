import { Inject, Injectable } from '@nestjs/common';
import type { QuizSnapshot } from '@quizpulse/game-engine';
import type { QuizInput } from '@quizpulse/protocol';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { AppError } from '../common/errors.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { images, questions, quizzes } from '../db/schema.js';
import { loadQuiz, loadSummaries } from './quiz.repository.js';
import { type Quiz, type QuizSummary, toQuestionRows, toQuizColumns, toSnapshot } from './quiz.mapper.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class QuizzesService {
    constructor(@Inject(DB) private readonly db: Database) {}

    list(hostId: string): Promise<QuizSummary[]> {
        return loadSummaries(this.db, eq(quizzes.ownerId, hostId));
    }

    async get(hostId: string, id: string): Promise<Quiz> {
        const quiz = UUID.test(id)
            ? await loadQuiz(this.db, and(eq(quizzes.id, id), eq(quizzes.ownerId, hostId)))
            : undefined;
        if (!quiz) throw new AppError('NOT_FOUND', 404);
        return quiz;
    }

    async create(hostId: string, input: QuizInput): Promise<Quiz> {
        await this.assertImagesOwned(hostId, input);
        const id = await this.db.transaction(async (tx) => {
            const [row] = await tx
                .insert(quizzes)
                .values({ ownerId: hostId, ...toQuizColumns(input) })
                .returning({ id: quizzes.id });
            if (!row) throw new Error('quiz insert returned no row');
            await tx.insert(questions).values(toQuestionRows(row.id, input.questions));
            return row.id;
        });
        return this.get(hostId, id);
    }

    async replace(hostId: string, id: string, input: QuizInput): Promise<Quiz> {
        await this.assertImagesOwned(hostId, input);
        await this.get(hostId, id);
        const found = await this.db.transaction(async (tx) => {
            const [row] = await tx
                .update(quizzes)
                .set({ ...toQuizColumns(input), updatedAt: new Date() })
                .where(and(eq(quizzes.id, id), eq(quizzes.ownerId, hostId)))
                .returning({ id: quizzes.id });
            if (!row) return false;
            await tx.delete(questions).where(eq(questions.quizId, id));
            await tx.insert(questions).values(toQuestionRows(id, input.questions));
            return true;
        });
        if (!found) throw new AppError('NOT_FOUND', 404);
        return this.get(hostId, id);
    }

    async remove(hostId: string, id: string): Promise<void> {
        // games.quiz_id is ON DELETE SET NULL, so finished and running games keep their snapshot.
        const deleted = UUID.test(id)
            ? await this.db
                  .delete(quizzes)
                  .where(and(eq(quizzes.id, id), eq(quizzes.ownerId, hostId)))
                  .returning({ id: quizzes.id })
            : [];
        if (deleted.length === 0) throw new AppError('NOT_FOUND', 404);
    }

    /** Own quiz or built-in pack, with per-question time limits resolved against the quiz default. */
    async snapshotForGame(hostId: string, quizId: string): Promise<QuizSnapshot> {
        if (!UUID.test(quizId)) throw new AppError('NOT_FOUND', 404);
        const [row] = await this.db
            .select()
            .from(quizzes)
            .where(and(eq(quizzes.id, quizId), or(eq(quizzes.ownerId, hostId), isNull(quizzes.ownerId))))
            .limit(1);
        if (!row) throw new AppError('NOT_FOUND', 404);
        const questionRows = await this.db
            .select()
            .from(questions)
            .where(eq(questions.quizId, row.id))
            .orderBy(asc(questions.position));
        return toSnapshot(row, questionRows);
    }

    /** A question may only reference an image uploaded by the same host. */
    private async assertImagesOwned(hostId: string, input: QuizInput): Promise<void> {
        const ids = [...new Set(input.questions.flatMap((q) => (q.imageId === null ? [] : [q.imageId])))];
        if (ids.length === 0) return;
        if (!ids.every((id) => UUID.test(id))) throw new AppError('INVALID_PAYLOAD', 400);
        const owned = await this.db
            .select({ id: images.id })
            .from(images)
            .where(and(inArray(images.id, ids), eq(images.ownerId, hostId)));
        if (owned.length !== ids.length) throw new AppError('INVALID_PAYLOAD', 400);
    }
}
