import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { QuizzesModule } from '../quizzes/quizzes.module.js';
import { GameGateway } from './game.gateway.js';
import { GameService } from './game.service.js';
import { GameStore } from './game.store.js';
import { GameTimers } from './game.timers.js';
import { GamesController } from './games.controller.js';
import { HistoryController } from './history.controller.js';
import { HistoryService } from './history.service.js';

@Module({
    imports: [QuizzesModule, AuthModule],
    controllers: [GamesController, HistoryController],
    providers: [GameStore, GameTimers, GameService, HistoryService, GameGateway],
    exports: [GameStore, GameService, HistoryService, GameGateway],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GamesModule {}
