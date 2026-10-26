import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/errors.js';

export type HostRequest = Request & { hostId: string };

/** Requires a logged-in host (`401 UNAUTHENTICATED` otherwise) and exposes the id as `req.hostId`. */
@Injectable()
export class HostGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        const hostId = req.session.hostId;
        if (!hostId) throw new AppError('UNAUTHENTICATED', 401);
        (req as HostRequest).hostId = hostId;
        return true;
    }
}
