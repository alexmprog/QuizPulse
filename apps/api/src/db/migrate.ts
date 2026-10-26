import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase, createPool } from './client.js';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Applies every pending migration; safe to call on each start (applied ones are skipped). */
export async function runMigrations(databaseUrl: string): Promise<void> {
    const pool = createPool(databaseUrl);
    try {
        await migrate(createDatabase(pool), { migrationsFolder: MIGRATIONS_DIR });
    } finally {
        await pool.end();
    }
}
