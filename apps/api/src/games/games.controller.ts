import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { HostGuard, type HostRequest } from '../auth/host.guard.js';
import { AppError } from '../common/errors.js';
import { type CreatedGame, GameService } from './game.service.js';

@Controller('api/v1/games')
@UseGuards(HostGuard)
export class GamesController {
    constructor(private readonly games: GameService) {}

    /** The OpenAPI validator guarantees `{ quizId: uuid }`. */
    @Post()
    create(@Req() req: HostRequest, @Body() body: { quizId: string }): Promise<CreatedGame> {
        return this.games.createGame(req.hostId, body.quizId);
    }

    @Get('active')
    async active(@Req() req: HostRequest): Promise<CreatedGame> {
        const game = await this.games.activeGame(req.hostId);
        if (!game) throw new AppError('NOT_FOUND', 404);
        return game;
    }
}
