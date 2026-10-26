import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { HostGuard, type HostRequest } from '../auth/host.guard.js';
import type { Quiz, QuizSummary } from '../quizzes/quiz.mapper.js';
import { PacksService } from './packs.service.js';

@Controller('api/v1/packs')
@UseGuards(HostGuard)
export class PacksController {
    constructor(private readonly packs: PacksService) {}

    @Get()
    list(@Query('language') language?: 'ru' | 'en'): Promise<QuizSummary[]> {
        return this.packs.list(language);
    }

    @Get(':id')
    get(@Param('id') id: string): Promise<Quiz> {
        return this.packs.get(id);
    }

    @Post(':id/copy')
    copy(@Req() req: HostRequest, @Param('id') id: string): Promise<Quiz> {
        return this.packs.copy(req.hostId, id);
    }
}
