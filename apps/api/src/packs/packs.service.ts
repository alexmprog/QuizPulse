import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { AppError } from '../common/errors.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { quizzes } from '../db/schema.js';
import { type Quiz, type QuizSummary, toQuizInput } from '../quizzes/quiz.mapper.js';
import { loadQuiz, loadSummaries } from '../quizzes/quiz.repository.js';
import { QuizzesService } from '../quizzes/quizzes.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PacksService {
    constructor(
        @Inject(DB) private readonly db: Database,
        private readonly quizzes: QuizzesService,
    ) {}

    list(language?: 'ru' | 'en'): Promise<QuizSummary[]> {
        const builtIn = isNull(quizzes.ownerId);
        return loadSummaries(this.db, language ? and(builtIn, eq(quizzes.language, language)) : builtIn);
    }

    async get(id: string): Promise<Quiz> {
        const pack = UUID.test(id)
            ? await loadQuiz(this.db, and(eq(quizzes.id, id), isNull(quizzes.ownerId)))
            : undefined;
        if (!pack) throw new AppError('NOT_FOUND', 404);
        return pack;
    }

    /** Built-in pack questions carry no images, so the copy needs no image ownership handling. */
    async copy(hostId: string, id: string): Promise<Quiz> {
        return this.quizzes.create(hostId, toQuizInput(await this.get(id)));
    }
}
