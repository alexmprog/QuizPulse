import { Module } from '@nestjs/common';
import { QuizzesController } from './quizzes.controller.js';
import { QuizzesService } from './quizzes.service.js';

@Module({
    controllers: [QuizzesController],
    providers: [QuizzesService],
    exports: [QuizzesService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class QuizzesModule {}
