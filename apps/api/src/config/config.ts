import { z } from 'zod';

export interface AppConfig {
    port: number;
    publicBaseUrl: string;
    databaseUrl: string;
    redisUrl: string;
    s3: { endpoint: string; region: string; accessKey: string; secretKey: string; bucket: string };
    sessionSecret: string;
    csrfSecret: string;
    cookieSecure: boolean;
    validateResponses: boolean;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    PUBLIC_BASE_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1).default('quizpulse-images'),
    SESSION_SECRET: z.string().min(32),
    CSRF_SECRET: z.string().min(32),
    COOKIE_SECURE: booleanFlag.default(false),
    VALIDATE_RESPONSES: booleanFlag.default(false),
});

/** Parses and validates the environment; throws an error naming every offending variable. */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
    const parsed = envSchema.safeParse(env);
    if (!parsed.success) {
        const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
        throw new Error(`Invalid environment configuration:\n  ${problems.join('\n  ')}`);
    }
    const e = parsed.data;
    return {
        port: e.PORT,
        publicBaseUrl: e.PUBLIC_BASE_URL.replace(/\/+$/, ''),
        databaseUrl: e.DATABASE_URL,
        redisUrl: e.REDIS_URL,
        s3: {
            endpoint: e.S3_ENDPOINT,
            region: e.S3_REGION,
            accessKey: e.S3_ACCESS_KEY,
            secretKey: e.S3_SECRET_KEY,
            bucket: e.S3_BUCKET,
        },
        sessionSecret: e.SESSION_SECRET,
        csrfSecret: e.CSRF_SECRET,
        cookieSecure: e.COOKIE_SECURE,
        validateResponses: e.VALIDATE_RESPONSES,
    };
}
