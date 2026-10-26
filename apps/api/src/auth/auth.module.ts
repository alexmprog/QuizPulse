import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { REDIS } from '../redis/redis.module.js';
import type { Redis } from 'ioredis';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CSRF, createCsrf } from './csrf.js';
import { HostGuard } from './host.guard.js';
import { SESSION_MIDDLEWARE, sessionMiddleware } from './session.js';

@Module({
    controllers: [AuthController],
    providers: [
        AuthService,
        HostGuard,
        { provide: CSRF, inject: [APP_CONFIG], useFactory: createCsrf },
        {
            provide: SESSION_MIDDLEWARE,
            inject: [APP_CONFIG, REDIS],
            useFactory: (config: AppConfig, redis: Redis) => sessionMiddleware(config, redis),
        },
    ],
    exports: [SESSION_MIDDLEWARE, CSRF, HostGuard],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuthModule {}
