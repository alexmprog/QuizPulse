import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

export const REDIS = Symbol('REDIS');

class RedisLifecycle implements OnModuleDestroy {
    constructor(@Inject(REDIS) private readonly redis: Redis) {}

    async onModuleDestroy(): Promise<void> {
        await this.redis.quit();
    }
}

@Global()
@Module({
    providers: [
        { provide: REDIS, inject: [APP_CONFIG], useFactory: (config: AppConfig) => new Redis(config.redisUrl) },
        RedisLifecycle,
    ],
    exports: [REDIS],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class RedisModule {}
