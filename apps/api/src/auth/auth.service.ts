import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { AppError } from '../common/errors.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { users } from '../db/schema.js';

export interface HostView {
    id: string;
    email: string;
}

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
    // Drizzle wraps driver errors; the pg error (with `code`) is the cause.
    for (let current: unknown = error; current instanceof Error; current = current.cause) {
        if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    }
    return false;
}

@Injectable()
export class AuthService {
    // Verified against when the email is unknown, so unknown-email and wrong-password cost the same time.
    private readonly dummyHash = argon2.hash('quizpulse-dummy-password', { type: argon2.argon2id });

    constructor(@Inject(DB) private readonly db: Database) {}

    async register(email: string, password: string): Promise<HostView> {
        const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
        try {
            const [row] = await this.db.insert(users).values({ email, passwordHash }).returning();
            if (!row) throw new Error('insert returned no row');
            return { id: row.id, email: row.email };
        } catch (error) {
            if (isUniqueViolation(error)) throw new AppError('EMAIL_TAKEN', 409);
            throw error;
        }
    }

    async login(email: string, password: string): Promise<HostView> {
        const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
        const valid = await argon2.verify(row?.passwordHash ?? (await this.dummyHash), password);
        if (!row || !valid) throw new AppError('INVALID_CREDENTIALS', 401);
        return { id: row.id, email: row.email };
    }

    async findHost(id: string): Promise<HostView | null> {
        const [row] = await this.db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(eq(users.id, id))
            .limit(1);
        return row ?? null;
    }
}
