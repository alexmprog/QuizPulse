import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { components } from '@quizpulse/api-types';
import { quizInputSchema } from '@quizpulse/protocol';
import { PackSeeder } from '../src/packs/pack-seeder.js';
import { QuizzesService } from '../src/quizzes/quizzes.service.js';
import { createTestApp, type TestApp } from './support/app.js';
import { registerHost } from './support/hosts.js';
import { sampleQuiz } from './support/quiz-fixtures.js';

type Quiz = components['schemas']['Quiz'];
type Summary = components['schemas']['QuizSummary'];

function firstOf<T>(items: T[]): T {
    const [first] = items;
    if (first === undefined) throw new Error('expected a non-empty list');
    return first;
}

const SEED_DIR = join(import.meta.dirname, '..', 'seed', 'packs');

describe('built-in packs', () => {
    let ctx: TestApp;

    beforeAll(async () => {
        ctx = await createTestApp();
    });
    afterAll(async () => {
        await ctx.close();
    });

    it('seed files are valid quizzes with all question types', () => {
        const files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'));
        expect(files.sort()).toEqual([
            'en-general.json',
            'en-movies.json',
            'en-science.json',
            'ru-general.json',
            'ru-movies.json',
            'ru-science.json',
        ]);
        for (const file of files) {
            const pack = JSON.parse(readFileSync(join(SEED_DIR, file), 'utf8')) as {
                packKey: string;
                language: string;
            };
            const { packKey, ...input } = pack;
            expect(packKey, file).toBe(file.replace('.json', ''));
            const parsed = quizInputSchema.parse(input);
            expect(parsed.questions, file).toHaveLength(12);
            const count = (type: string) => parsed.questions.filter((q) => q.type === type).length;
            expect(count('single_choice'), file).toBeGreaterThan(0);
            expect(count('true_false'), file).toBeGreaterThanOrEqual(2);
            expect(count('numeric'), file).toBeGreaterThanOrEqual(2);
            expect(parsed.language, file).toBe(file.slice(0, 2));
        }
    });

    it('seeder loads 6 packs idempotently', async () => {
        await ctx.app.get(PackSeeder).seed();
        await ctx.app.get(PackSeeder).seed();
        const host = await registerHost(ctx.url);
        const list = (await (await host.request('GET', '/api/v1/packs')).json()) as Summary[];
        expect(list).toHaveLength(6);
        expect(list.every((p) => p.isPack && p.questionCount === 12)).toBe(true);

        const pack = (await (await host.request('GET', `/api/v1/packs/${firstOf(list).id}`)).json()) as Quiz;
        expect(pack.isPack).toBe(true);
        expect(pack.packKey).not.toBeNull();
        expect(pack.questions).toHaveLength(12);
    });

    it('list filters by language', async () => {
        const host = await registerHost(ctx.url);
        const ru = (await (await host.request('GET', '/api/v1/packs?language=ru')).json()) as Summary[];
        const en = (await (await host.request('GET', '/api/v1/packs?language=en')).json()) as Summary[];
        expect(ru).toHaveLength(3);
        expect(en).toHaveLength(3);
        expect(ru.every((p) => p.language === 'ru')).toBe(true);
        expect((await host.request('GET', '/api/v1/packs?language=de')).status).toBe(400);
    });

    it('copy creates owned editable quiz', async () => {
        const host = await registerHost(ctx.url);
        const pack = firstOf((await (await host.request('GET', '/api/v1/packs?language=en')).json()) as Summary[]);
        const res = await host.request('POST', `/api/v1/packs/${pack.id}/copy`);
        expect(res.status).toBe(201);
        const copy = (await res.json()) as Quiz;
        expect(copy).toMatchObject({ isPack: false, packKey: null, title: pack.title });
        expect(copy.id).not.toBe(pack.id);
        expect(copy.questions).toHaveLength(12);

        const edited = await host.request('PUT', `/api/v1/quizzes/${copy.id}`, { body: sampleQuiz() });
        expect(edited.status).toBe(200);
        const mine = (await (await host.request('GET', '/api/v1/quizzes')).json()) as Summary[];
        expect(mine.map((q) => q.id)).toEqual([copy.id]);

        const missing = await host.request('POST', '/api/v1/packs/00000000-0000-4000-8000-000000000000/copy');
        expect(missing.status).toBe(404);
    });

    it('pack cannot be edited via PUT /quizzes/{id} -> 404', async () => {
        const host = await registerHost(ctx.url);
        const pack = firstOf((await (await host.request('GET', '/api/v1/packs')).json()) as Summary[]);
        for (const method of ['GET', 'PUT', 'DELETE'] as const) {
            const res = await host.request(method, `/api/v1/quizzes/${pack.id}`, {
                body: method === 'PUT' ? sampleQuiz() : undefined,
            });
            expect(res.status, method).toBe(404);
        }
    });

    it('snapshotForGame accepts a pack', async () => {
        const host = await registerHost(ctx.url);
        const me = (await (await host.request('GET', '/api/v1/auth/me')).json()) as { id: string };
        const pack = firstOf((await (await host.request('GET', '/api/v1/packs')).json()) as Summary[]);
        const snapshot = await ctx.app.get(QuizzesService).snapshotForGame(me.id, pack.id);
        expect(snapshot.questions).toHaveLength(12);
    });

    it('packs require a session', async () => {
        const res = await fetch(`${ctx.url}/api/v1/packs`);
        expect(res.status).toBe(401);
    });
});
