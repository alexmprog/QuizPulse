import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import type { ErrorCode } from '@quizpulse/protocol';
import type { AppConfig } from '../config/config.js';

export const CSRF = Symbol('CSRF');
export const CSRF_COOKIE = 'qp_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export interface Csrf {
    /** Rejects POST/PUT/DELETE without a matching header and cookie as `403 CSRF_INVALID`. */
    protection: RequestHandler;
    /** Turns a CSRF failure into `403 CSRF_INVALID`; must be mounted right after `protection`. */
    errorHandler: ErrorRequestHandler;
    /** Sets the CSRF cookie bound to the current session and returns the matching token. */
    issueToken(req: Request, res: Response): string;
}

/** Double-submit CSRF (csrf-csrf): the token is bound to the session id, so it must be reissued whenever that changes. */
export function createCsrf(config: AppConfig): Csrf {
    const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } = doubleCsrf({
        getSecret: () => config.csrfSecret,
        getSessionIdentifier: (req) => req.session.id,
        cookieName: CSRF_COOKIE,
        cookieOptions: { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' },
        getCsrfTokenFromRequest: (req) => req.headers[CSRF_HEADER],
        ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    });
    return {
        protection: doubleCsrfProtection,
        errorHandler: (error: unknown, _req, res, next) => {
            if (error === invalidCsrfTokenError) res.status(403).json({ code: 'CSRF_INVALID' satisfies ErrorCode });
            else next(error);
        },
        issueToken: (req, res) => generateCsrfToken(req, res, { overwrite: true }),
    };
}
