import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ErrorCode } from '@quizpulse/protocol';
import type { Response } from 'express';

export class AppError extends Error {
    constructor(
        readonly code: ErrorCode,
        readonly status: number,
        readonly extra?: object,
    ) {
        super(code);
        this.name = 'AppError';
    }
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
    400: 'INVALID_PAYLOAD',
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
};

/** Turns every thrown error into `{ code, ...extra }` with the matching HTTP status. */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(AppExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();
        if (exception instanceof AppError) {
            response.status(exception.status).json({ ...exception.extra, code: exception.code });
            return;
        }
        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            if (status >= 400 && status < 500) {
                // Keep the real 4xx status; codes without a dedicated mapping are reported as a bad request payload.
                response.status(status).json({ code: STATUS_TO_CODE[status] ?? 'INVALID_PAYLOAD' });
                return;
            }
        }
        this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
        response.status(500).json({ code: 'INTERNAL_ERROR' satisfies ErrorCode });
    }
}
