import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export function createPool(databaseUrl: string): pg.Pool {
    return new pg.Pool({ connectionString: databaseUrl });
}

export function createDatabase(pool: pg.Pool): Database {
    return drizzle(pool, { schema });
}
