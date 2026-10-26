import type { AddressInfo, Server } from 'node:net';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import type { Clock } from '../../src/common/clock.js';
import { type AppConfig, loadConfig } from '../../src/config/config.js';
import { type Infra, startInfra } from './containers.js';

export interface TestApp {
    app: INestApplication;
    url: string;
    config: AppConfig;
    close(): Promise<void>;
}

/**
 * Boots the real application on an ephemeral port against throwaway Testcontainers (started once per call,
 * stopped by `close`). Responses are validated against the OpenAPI contract by default. With `infra`, the app
 * runs on containers the caller owns and `close` leaves them running (to boot another app on the same data).
 */
export async function createTestApp(
    overrides: { clock?: Clock; config?: Partial<AppConfig>; controllers?: Type[]; infra?: Infra } = {},
): Promise<TestApp> {
    const owned = overrides.infra === undefined;
    const infra: Infra = overrides.infra ?? (await startInfra());
    const stopInfra = async () => {
        if (owned) await infra.stop();
    };
    try {
        const config: AppConfig = {
            ...loadConfig({
                PUBLIC_BASE_URL: 'http://localhost:8080',
                DATABASE_URL: infra.databaseUrl,
                REDIS_URL: infra.redisUrl,
                S3_ENDPOINT: infra.s3.endpoint,
                S3_REGION: infra.s3.region,
                S3_ACCESS_KEY: infra.s3.accessKey,
                S3_SECRET_KEY: infra.s3.secretKey,
                S3_BUCKET: infra.s3.bucket,
                SESSION_SECRET: 'test-session-secret-0123456789abcdef',
                CSRF_SECRET: 'test-csrf-secret-0123456789abcdefgh',
                VALIDATE_RESPONSES: 'true',
            }),
            ...overrides.config,
        };
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule.register({ config, clock: overrides.clock })],
            controllers: overrides.controllers,
        }).compile();
        const app = moduleRef.createNestApplication();
        configureApp(app, config);
        await app.listen(0, '127.0.0.1');
        const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
        return {
            app,
            url: `http://127.0.0.1:${String(port)}`,
            config,
            async close() {
                await app.close();
                await stopInfra();
            },
        };
    } catch (error) {
        await stopInfra();
        throw error;
    }
}
