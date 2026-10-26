import { asc, desc, eq, type SQL, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { questions, quizzes } from '../db/schema.js';
import { type Quiz, type QuizSummary, toQuiz, toSummary } from './quiz.mapper.js';

/** Reads shared by own quizzes and built-in packs; callers decide which rows are visible via `where`. */
export async function loadQuiz(db: Database, where: SQL | undefined): Promise<Quiz | undefined> {
    const [row] = await db.select().from(quizzes).where(where).limit(1);
    if (!row) return undefined;
    const questionRows = await db
        .select()
        .from(questions)
        .where(eq(questions.quizId, row.id))
        .orderBy(asc(questions.position));
    return toQuiz(row, questionRows);
}

export async function loadSummaries(db: Database, where: SQL | undefined): Promise<QuizSummary[]> {
    const rows = await db
        .select({
            quiz: quizzes,
            count: sql<number>`(select count(*)::int from questions q where q.quiz_id = quizzes.id)`,
        })
        .from(quizzes)
        .where(where)
        .orderBy(desc(quizzes.updatedAt), asc(quizzes.title));
    return rows.map(({ quiz, count }) => toSummary(quiz, count));
}
