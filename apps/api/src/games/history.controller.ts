import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { HostGuard, type HostRequest } from '../auth/host.guard.js';
import { type GameDetail, type GameSummary, HistoryService } from './history.service.js';

@Controller('api/v1/history')
@UseGuards(HostGuard)
export class HistoryController {
    constructor(private readonly history: HistoryService) {}

    @Get()
    list(@Req() req: HostRequest): Promise<GameSummary[]> {
        return this.history.list(req.hostId);
    }

    @Get(':gameId')
    get(@Req() req: HostRequest, @Param('gameId') gameId: string): Promise<GameDetail> {
        return this.history.get(req.hostId, gameId);
    }
}
