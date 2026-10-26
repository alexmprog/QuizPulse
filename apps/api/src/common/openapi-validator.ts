import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type INestApplication, Logger } from '@nestjs/common';
import { IMAGE_MAX_BYTES, type ErrorCode } from '@quizpulse/protocol';
import { type ErrorRequestHandler, json } from 'express';
import * as OpenApiValidator from 'express-openapi-validator';

const OUTSIDE_API_PREFIX = /^(?!\/api\/v1(\/|$))/;

function findOpenApiSpec(): string {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (;;) {
        const candidate = join(dir, 'contracts', 'openapi.yaml');
        if (existsSync(candidate)) return candidate;
        const parent = resolve(dir, '..');
        if (parent === dir) throw new Error('contracts/openapi.yaml not found');
        dir = parent;
    }
}

const IMAGE_ROUTES = /^\/api\/v1\/images(\/|$|\?)/;
const IMAGE_STATUS_CODES: Record<number, ErrorCode> = {
    413: 'IMAGE_TOO_LARGE',
    415: 'IMAGE_TYPE_UNSUPPORTED',
};

/**
 * Turns validator failures into `{ code }`. On `/api/v1/images` 413/415 keep their status with the image codes;
 * elsewhere 413/415 keep their status with `INVALID_PAYLOAD`, any other 4xx becomes 400 `INVALID_PAYLOAD`,
 * and everything else is a 500 `INTERNAL_ERROR`.
 */
const validationErrorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }
    const status = (error as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
        const imageCode = IMAGE_ROUTES.test(req.originalUrl) ? IMAGE_STATUS_CODES[status] : undefined;
        const keepStatus = imageCode !== undefined || status === 413 || status === 415;
        res.status(keepStatus ? status : 400).json({ code: imageCode ?? 'INVALID_PAYLOAD' });
        return;
    }
    new Logger('OpenApiValidator').error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    res.status(500).json({ code: 'INTERNAL_ERROR' satisfies ErrorCode });
};

/**
 * Validates requests (and optionally responses) of every `/api/v1` operation against `contracts/openapi.yaml`.
 * Paths that the contract does not document are passed through untouched (`ignoreUndocumented`).
 */
export function applyOpenApiValidator(app: INestApplication, options: { validateResponses: boolean }): void {
    // Nest registers its body parser after user middleware, so the validator needs the parsed body up front.
    app.use(json());
    app.use(
        ...OpenApiValidator.middleware({
            apiSpec: findOpenApiSpec(),
            validateRequests: true,
            validateResponses: options.validateResponses,
            validateSecurity: false,
            // The validator parses multipart bodies itself (multer, memory storage); oversize files become 413.
            fileUploader: { limits: { fileSize: IMAGE_MAX_BYTES, files: 1 } },
            ignoreUndocumented: true,
            ignorePaths: OUTSIDE_API_PREFIX,
        }),
        validationErrorHandler,
    );
}
