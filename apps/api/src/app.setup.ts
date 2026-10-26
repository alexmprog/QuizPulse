import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { CSRF, type Csrf } from './auth/csrf.js';
import { SESSION_MIDDLEWARE } from './auth/session.js';
import { AppExceptionFilter } from './common/errors.js';
import { applyOpenApiValidator } from './common/openapi-validator.js';
import type { AppConfig } from './config/config.js';
import type { RequestHandler } from 'express';

/**
 * Cross-cutting HTTP setup shared by `main.ts` and the test app.
 * Order matters: cookies -> session -> CSRF -> contract validation -> routes.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
    const csrf = app.get<Csrf>(CSRF);
    app.useGlobalFilters(new AppExceptionFilter());
    app.use(cookieParser());
    app.use(app.get<RequestHandler>(SESSION_MIDDLEWARE));
    app.use(csrf.protection, csrf.errorHandler);
    applyOpenApiValidator(app, { validateResponses: config.validateResponses });
}
