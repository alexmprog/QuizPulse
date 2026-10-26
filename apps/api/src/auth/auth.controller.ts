import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../common/errors.js';
import { AuthService, type HostView } from './auth.service.js';
import { CSRF, CSRF_HEADER, type Csrf } from './csrf.js';
import { HostGuard, type HostRequest } from './host.guard.js';
import { promisified, SESSION_COOKIE } from './session.js';

interface Credentials {
    email: string;
    password: string;
}

@Controller('api/v1/auth')
export class AuthController {
    constructor(
        private readonly auth: AuthService,
        @Inject(CSRF) private readonly csrf: Csrf,
    ) {}

    @Get('csrf')
    csrfToken(@Req() req: Request, @Res({ passthrough: true }) res: Response): { token: string } {
        // The token is bound to the session id; touching the session makes express-session persist it and set its cookie.
        req.session.csrf = true;
        return { token: this.csrf.issueToken(req, res) };
    }

    @Post('register')
    async register(
        @Body() body: Credentials,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<HostView> {
        const host = await this.auth.register(body.email, body.password);
        await this.startSession(req, res, host.id);
        return host;
    }

    @Post('login')
    @HttpCode(200)
    async login(
        @Body() body: Credentials,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<HostView> {
        const host = await this.auth.login(body.email, body.password);
        await this.startSession(req, res, host.id);
        return host;
    }

    @Post('logout')
    @HttpCode(204)
    @UseGuards(HostGuard)
    async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
        await promisified((cb) => req.session.destroy(cb));
        res.clearCookie(SESSION_COOKIE);
    }

    @Get('me')
    @UseGuards(HostGuard)
    async me(@Req() req: HostRequest): Promise<HostView> {
        const host = await this.auth.findHost(req.hostId);
        if (!host) {
            await promisified((cb) => req.session.destroy(cb));
            throw new AppError('UNAUTHENTICATED', 401);
        }
        return host;
    }

    /**
     * Fresh session id on every login (session-fixation defence). The CSRF token is bound to the session id, so
     * the new token is handed back in the `X-CSRF-Token` response header together with its cookie.
     */
    private async startSession(req: Request, res: Response, hostId: string): Promise<void> {
        await promisified((cb) => req.session.regenerate(cb));
        req.session.hostId = hostId;
        await promisified((cb) => req.session.save(cb));
        res.setHeader(CSRF_HEADER, this.csrf.issueToken(req, res));
    }
}
