import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { components } from '@quizpulse/api-types';
import { toQuizInput } from '../src/quizzes/quiz.mapper.js';
import { QuizzesService } from '../src/quizzes/quizzes.service.js';
import { createTestApp, type TestApp } from './support/app.js';
import { registerHost } from './support/hosts.js';
import { choiceQuestion, numericQuestion, PNG_BYTES, sampleQuiz, trueFalseQuestion } from './support/quiz-fixtures.js';

type Quiz = components['schemas']['Quiz'];

describe('quizzes', () => {
    let ctx: TestApp;

    beforeAll(async () => {
        ctx = await createTestApp();
    });
    afterAll(async () => {
        await ctx.close();
    });

    it('create and get roundtrip preserves question order and fields', async () => {
        const host = await registerHost(ctx.url);
        const input = sampleQuiz({
            questions: [numericQuestion(), choiceQuestion(), trueFalseQuestion({ correctOption: 1 })],
        });
        const created = await host.request('POST', '/api/v1/quizzes', { body: input });
        expect(created.status).toBe(201);
        const quiz = (await created.json()) as Quiz;
        expect(quiz).toMatchObject({ title: 'Sample quiz', language: 'en', isPack: false, packKey: null });
        expect(quiz.settings).toEqual(input.settings);

        const got = await host.request('GET', `/api/v1/quizzes/${quiz.id}`);
        expect(got.status).toBe(200);
        const fetched = (await got.json()) as Quiz;
        expect(fetched.questions.map((q) => q.position)).toEqual([0, 1, 2]);
        expect(fetched.questions.map((q) => toQuizInput({ ...quiz, questions: [q] }).questions[0])).toEqual(
            input.questions,
        );

        const list = (await (await host.request('GET', '/api/v1/quizzes')).json()) as {
            id: string;
            questionCount: number;
        }[];
        expect(list).toContainEqual(expect.objectContaining({ id: quiz.id, questionCount: 3, isPack: false }));
    });

    it('other host gets 404', async () => {
        const owner = await registerHost(ctx.url);
        const other = await registerHost(ctx.url);
        const quiz = (await (await owner.request('POST', '/api/v1/quizzes', { body: sampleQuiz() })).json()) as Quiz;

        for (const [method, body] of [['GET'], ['PUT', sampleQuiz()], ['DELETE']] as const) {
            const res = await other.request(method, `/api/v1/quizzes/${quiz.id}`, { body });
            expect(res.status, method).toBe(404);
            expect(await res.json()).toEqual({ code: 'NOT_FOUND' });
        }
        const list = (await (await other.request('GET', '/api/v1/quizzes')).json()) as unknown[];
        expect(list).toEqual([]);
    });

    it('replace replaces questions wholesale', async () => {
        const host = await registerHost(ctx.url);
        const quiz = (await (await host.request('POST', '/api/v1/quizzes', { body: sampleQuiz() })).json()) as Quiz;
        const replacement = sampleQuiz({
            title: 'Renamed',
            language: 'ru',
            questions: [trueFalseQuestion({ text: 'Only one' })],
        });
        const res = await host.request('PUT', `/api/v1/quizzes/${quiz.id}`, { body: replacement });
        expect(res.status).toBe(200);
        const updated = (await res.json()) as Quiz;
        expect(updated.id).toBe(quiz.id);
        expect(updated.title).toBe('Renamed');
        expect(updated.language).toBe('ru');
        expect(updated.questions).toHaveLength(1);
        expect(updated.questions[0]).toMatchObject({ text: 'Only one', position: 0 });
        expect(updated.questions[0]?.id).not.toBe(quiz.questions[0]?.id);
    });

    it('delete then get -> 404', async () => {
        const host = await registerHost(ctx.url);
        const quiz = (await (await host.request('POST', '/api/v1/quizzes', { body: sampleQuiz() })).json()) as Quiz;
        expect((await host.request('DELETE', `/api/v1/quizzes/${quiz.id}`)).status).toBe(204);
        const res = await host.request('GET', `/api/v1/quizzes/${quiz.id}`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: 'NOT_FOUND' });
    });

    it('invalid quiz -> 400 INVALID_PAYLOAD', async () => {
        const host = await registerHost(ctx.url);
        const bad = sampleQuiz({ questions: [choiceQuestion({ correctOption: 7 })] });
        const res = await host.request('POST', '/api/v1/quizzes', { body: bad });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ code: 'INVALID_PAYLOAD' });
        const empty = await host.request('POST', '/api/v1/quizzes', { body: sampleQuiz({ questions: [] }) });
        expect(empty.status).toBe(400);
    });

    it('whitespace-only texts -> 400; surrounding whitespace is trimmed on save', async () => {
        const host = await registerHost(ctx.url);
        const blank = [
            sampleQuiz({ title: '   ' }),
            sampleQuiz({ questions: [choiceQuestion({ text: ' \t ' })] }),
            sampleQuiz({ questions: [choiceQuestion({ options: ['a', '  ', 'c'] })] }),
        ];
        for (const body of blank) {
            const res = await host.request('POST', '/api/v1/quizzes', { body });
            expect(res.status).toBe(400);
            expect(await res.json()).toEqual({ code: 'INVALID_PAYLOAD' });
        }
        const padded = sampleQuiz({
            title: '  Padded  ',
            questions: [choiceQuestion({ text: ' Why? ', options: [' a', 'b ', 'c'] })],
        });
        const created = await host.request('POST', '/api/v1/quizzes', { body: padded });
        expect(created.status).toBe(201);
        const quiz = (await created.json()) as Quiz;
        expect(quiz.title).toBe('Padded');
        expect(quiz.questions[0]).toMatchObject({ text: 'Why?', options: ['a', 'b', 'c'] });
    });

    it('requires a session', async () => {
        const host = await registerHost(ctx.url);
        host.cookies.clear();
        expect((await host.request('GET', '/api/v1/quizzes')).status).toBe(401);
    });

    async function upload(host: Awaited<ReturnType<typeof registerHost>>): Promise<string> {
        const form = new FormData();
        form.set('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'pixel.png');
        const res = await fetch(`${ctx.url}/api/v1/images`, {
            method: 'POST',
            headers: {
                cookie: [...host.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
                'x-csrf-token': host.csrfToken ?? '',
            },
            body: form,
        });
        expect(res.status).toBe(201);
        return ((await res.json()) as { id: string }).id;
    }

    it('question referencing foreign image -> 400', async () => {
        const owner = await registerHost(ctx.url);
        const other = await registerHost(ctx.url);
        const imageId = await upload(owner);

        const own = await owner.request('POST', '/api/v1/quizzes', {
            body: sampleQuiz({ questions: [choiceQuestion({ imageId })] }),
        });
        expect(own.status).toBe(201);
        expect(((await own.json()) as Quiz).questions[0]?.imageId).toBe(imageId);

        const foreign = await other.request('POST', '/api/v1/quizzes', {
            body: sampleQuiz({ questions: [choiceQuestion({ imageId })] }),
        });
        expect(foreign.status).toBe(400);
        expect(await foreign.json()).toEqual({ code: 'INVALID_PAYLOAD' });

        const missing = await other.request('POST', '/api/v1/quizzes', {
            body: sampleQuiz({ questions: [choiceQuestion({ imageId: 'not-a-uuid' })] }),
        });
        expect(missing.status).toBe(400);
    });

    it('snapshotForGame resolves time limits and orders questions', async () => {
        const host = await registerHost(ctx.url);
        const me = (await (await host.request('GET', '/api/v1/auth/me')).json()) as { id: string };
        const quiz = (await (await host.request('POST', '/api/v1/quizzes', { body: sampleQuiz() })).json()) as Quiz;
        const service = ctx.app.get(QuizzesService);

        const snapshot = await service.snapshotForGame(me.id, quiz.id);
        expect(snapshot.quizId).toBe(quiz.id);
        expect(snapshot.title).toBe('Sample quiz');
        expect(snapshot.questions.map((q) => q.index)).toEqual([0, 1, 2]);
        expect(snapshot.questions.map((q) => q.timeLimitSeconds)).toEqual([20, 20, 30]);
        expect(snapshot.questions[2]).toMatchObject({ type: 'numeric', numericAnswer: 8, multiplier: 2 });

        const stranger = await registerHost(ctx.url);
        const strangerId = ((await (await stranger.request('GET', '/api/v1/auth/me')).json()) as { id: string }).id;
        await expect(service.snapshotForGame(strangerId, quiz.id)).rejects.toMatchObject({ status: 404 });
    });
});
