import { readdir, readFile } from 'node:fs/promises';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { quizInputSchema } from '@quizpulse/protocol';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { questions, quizzes } from '../db/schema.js';
import { toQuestionRows, toQuizColumns } from '../quizzes/quiz.mapper.js';

const SEED_DIR = new URL('../../seed/packs/', import.meta.url);

const packFileSchema = quizInputSchema.extend({ packKey: z.string().min(1) });

/** Upserts the built-in packs from `seed/packs/*.json` by `pack_key`, replacing their questions. */
@Injectable()
export class PackSeeder implements OnApplicationBootstrap {
    private readonly logger = new Logger(PackSeeder.name);

    constructor(@Inject(DB) private readonly db: Database) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.seed();
    }

    async seed(): Promise<void> {
        const files = (await readdir(SEED_DIR)).filter((name) => name.endsWith('.json')).sort();
        for (const file of files) {
            const content = await readFile(new URL(file, SEED_DIR), 'utf8');
            const parsed = packFileSchema.safeParse(JSON.parse(content));
            if (!parsed.success) throw new Error(`Invalid pack ${file}: ${z.prettifyError(parsed.error)}`);
            const { packKey, ...input } = parsed.data;
            await this.upsert(packKey, input);
        }
        this.logger.log(`Seeded ${String(files.length)} built-in packs`);
    }

    private async upsert(packKey: string, input: z.infer<typeof quizInputSchema>): Promise<void> {
        await this.db.transaction(async (tx) => {
            const columns = { ...toQuizColumns(input), updatedAt: new Date() };
            const [row] = await tx
                .insert(quizzes)
                .values({ ownerId: null, packKey, ...columns })
                .onConflictDoUpdate({ target: quizzes.packKey, set: columns })
                .returning({ id: quizzes.id });
            if (!row) throw new Error(`pack ${packKey} upsert returned no row`);
            await tx.delete(questions).where(eq(questions.quizId, row.id));
            await tx.insert(questions).values(toQuestionRows(row.id, input.questions));
        });
    }
}
