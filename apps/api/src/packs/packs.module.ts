import { Module } from '@nestjs/common';
import { QuizzesModule } from '../quizzes/quizzes.module.js';
import { PackSeeder } from './pack-seeder.js';
import { PacksController } from './packs.controller.js';
import { PacksService } from './packs.service.js';

@Module({
    imports: [QuizzesModule],
    controllers: [PacksController],
    providers: [PacksService, PackSeeder],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PacksModule {}
