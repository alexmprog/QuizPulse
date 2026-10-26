import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { quizInputSchema, type QuizInput } from '@quizpulse/protocol';
import { HostGuard, type HostRequest } from '../auth/host.guard.js';
import { AppError } from '../common/errors.js';
import type { Quiz, QuizSummary } from './quiz.mapper.js';
import { QuizzesService } from './quizzes.service.js';

/** The OpenAPI validator checks the shape; the zod schema adds the cross-field rules (per-type answers). */
export function parseQuizInput(body: unknown): QuizInput {
    const parsed = quizInputSchema.safeParse(body);
    if (!parsed.success) throw new AppError('INVALID_PAYLOAD', 400);
    return parsed.data;
}

@Controller('api/v1/quizzes')
@UseGuards(HostGuard)
export class QuizzesController {
    constructor(private readonly quizzes: QuizzesService) {}

    @Get()
    list(@Req() req: HostRequest): Promise<QuizSummary[]> {
        return this.quizzes.list(req.hostId);
    }

    @Post()
    create(@Req() req: HostRequest, @Body() body: unknown): Promise<Quiz> {
        return this.quizzes.create(req.hostId, parseQuizInput(body));
    }

    @Get(':id')
    get(@Req() req: HostRequest, @Param('id') id: string): Promise<Quiz> {
        return this.quizzes.get(req.hostId, id);
    }

    @Put(':id')
    replace(@Req() req: HostRequest, @Param('id') id: string, @Body() body: unknown): Promise<Quiz> {
        return this.quizzes.replace(req.hostId, id, parseQuizInput(body));
    }

    @Delete(':id')
    @HttpCode(204)
    async remove(@Req() req: HostRequest, @Param('id') id: string): Promise<void> {
        await this.quizzes.remove(req.hostId, id);
    }
}
