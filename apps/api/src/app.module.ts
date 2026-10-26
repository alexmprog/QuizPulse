import { type DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CLOCK, type Clock, systemClock } from './common/clock.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';
import { DbModule } from './db/db.module.js';
import { GamesModule } from './games/games.module.js';
import { HealthController } from './health/health.controller.js';
import { ImagesModule } from './images/images.module.js';
import { PacksModule } from './packs/packs.module.js';
import { QuizzesModule } from './quizzes/quizzes.module.js';
import { RedisModule } from './redis/redis.module.js';

// Static-only by design: Nest dynamic modules are configured through a `register` factory.
@Module({})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {
    static register(options: { config: AppConfig; clock?: Clock }): DynamicModule {
        return {
            module: AppModule,
            global: true,
            imports: [DbModule, RedisModule, AuthModule, QuizzesModule, PacksModule, ImagesModule, GamesModule],
            controllers: [HealthController],
            providers: [
                { provide: APP_CONFIG, useValue: options.config },
                { provide: CLOCK, useValue: options.clock ?? systemClock },
            ],
            exports: [APP_CONFIG, CLOCK],
        };
    }
}
