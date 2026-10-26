import { Global, Inject, Module, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import type pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { createDatabase, createPool, type Database } from './client.js';
import { runMigrations } from './migrate.js';

export const DB = Symbol('DB');
const PG_POOL = Symbol('PG_POOL');

/** Runs migrations before the app starts serving, then closes the pool on shutdown. */
class DatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
    constructor(
        @Inject(APP_CONFIG) private readonly config: AppConfig,
        @Inject(PG_POOL) private readonly pool: pg.Pool,
    ) {}

    async onModuleInit(): Promise<void> {
        await runMigrations(this.config.databaseUrl);
    }

    async onModuleDestroy(): Promise<void> {
        await this.pool.end();
    }
}

@Global()
@Module({
    providers: [
        { provide: PG_POOL, inject: [APP_CONFIG], useFactory: (config: AppConfig) => createPool(config.databaseUrl) },
        { provide: DB, inject: [PG_POOL], useFactory: (pool: pg.Pool): Database => createDatabase(pool) },
        DatabaseLifecycle,
    ],
    exports: [DB],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DbModule {}
