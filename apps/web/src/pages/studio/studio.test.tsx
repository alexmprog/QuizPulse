import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { quizInputSchema } from '@quizpulse/protocol';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newQuizInput } from '../../api/games';
import { setCsrfToken } from '../../api/client';
import { AuthProvider } from '../../auth/AuthProvider';
import { RequireAuth } from '../../auth/RequireAuth';
import { en } from '../../i18n/en';
import { I18nProvider } from '../../i18n/i18n';
import { ru } from '../../i18n/ru';
import { ThemeProvider } from '../../theme/theme';
import { ToastProvider } from '../../ui/Toast';
import { PackViewPage } from './PackViewPage';
import { PacksPage } from './PacksPage';
import { QuizzesPage } from './QuizzesPage';
import { StudioLayout } from './StudioLayout';

type Reply = { status?: number; body?: unknown };
const ME = { id: '11111111-1111-4111-8111-111111111111', email: 'host@example.com' };
const Q1 = {
    id: '22222222-2222-4222-8222-222222222221',
    title: 'Pub quiz',
    language: 'en',
    questionCount: 12,
    isPack: false,
    updatedAt: '2026-10-21T10:00:00.000Z',
};
const Q2 = { ...Q1, id: '22222222-2222-4222-8222-222222222222', title: 'Movies', questionCount: 3 };
const PACK = { ...Q1, id: '33333333-3333-4333-8333-333333333331', title: 'World capitals', isPack: true };
const GAME = { gameId: '44444444-4444-4444-8444-444444444444', pin: '123456', joinUrl: 'http://x/play?pin=123456' };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
type Routes_ = Record<string, Reply | (() => Reply)>;

function respond(routes: Routes_) {
    fetchMock.mockImplementation((url, init) => {
        const key = `${init?.method ?? 'GET'} ${url}`;
        const found = routes[key];
        const r = (typeof found === 'function' ? found() : found) ?? { status: 500, body: { code: 'INTERNAL_ERROR' } };
        return Promise.resolve(
            new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status ?? 200 }),
        );
    });
}

const base: Routes_ = {
    'GET /api/v1/auth/me': { body: ME },
    'GET /api/v1/auth/csrf': { body: { token: 't' } },
    'GET /api/v1/games/active': { status: 404, body: { code: 'NOT_FOUND' } },
    'GET /api/v1/quizzes': { body: [Q1, Q2] },
    'GET /api/v1/packs': { body: [PACK] },
};

function Where() {
    const { pathname } = useLocation();
    return <div data-testid="where">{pathname}</div>;
}

function renderAt(path: string) {
    return render(
        <ThemeProvider>
            <I18nProvider initial="en">
                <ToastProvider>
                    <MemoryRouter initialEntries={[path]}>
                        <AuthProvider>
                            <Routes>
                                <Route
                                    path="/studio"
                                    element={
                                        <RequireAuth>
                                            <StudioLayout />
                                        </RequireAuth>
                                    }
                                >
                                    <Route index element={<QuizzesPage />} />
                                    <Route path="packs" element={<PacksPage />} />
                                    <Route path="packs/:id" element={<PackViewPage />} />
                                    <Route path="quizzes/:id" element={<div>editor page</div>} />
                                </Route>
                                <Route path="/host/:gameId" element={<div>host page</div>} />
                            </Routes>
                            <Where />
                        </AuthProvider>
                    </MemoryRouter>
                </ToastProvider>
            </I18nProvider>
        </ThemeProvider>,
    );
}

function calls(method: string, url: string) {
    return fetchMock.mock.calls.filter(([u, init]) => u === url && (init?.method ?? 'GET') === method);
}

beforeEach(() => {
    fetchMock.mockReset();
    setCsrfToken(null);
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    setCsrfToken(null);
});

describe('quizzes page', () => {
    it('lists cards with question count', async () => {
        respond(base);
        renderAt('/studio');
        expect(await screen.findByText('Pub quiz')).toBeInTheDocument();
        expect(screen.getByText('Movies')).toBeInTheDocument();
        expect(screen.getByText(/12 questions/)).toBeInTheDocument();
        expect(screen.getByText(/3 questions/)).toBeInTheDocument();
        expect(screen.getByText('host@example.com')).toBeInTheDocument();
    });

    it('active game shows banner and disables start buttons', async () => {
        respond({ ...base, 'GET /api/v1/games/active': { body: GAME } });
        renderAt('/studio');
        expect(await screen.findByText(new RegExp(GAME.pin))).toBeInTheDocument();
        expect(screen.getByRole('link', { name: en.studio.backToGame })).toHaveAttribute(
            'href',
            `/host/${GAME.gameId}`,
        );
        const starts = screen.getAllByRole('button', { name: en.studio.startGame });
        expect(starts).toHaveLength(2);
        for (const b of starts) expect(b).toBeDisabled();
    });

    it('start game navigates to /host/:gameId', async () => {
        respond({ ...base, 'POST /api/v1/games': { status: 201, body: GAME } });
        renderAt('/studio');
        const user = userEvent.setup();
        await user.click((await screen.findAllByRole('button', { name: en.studio.startGame }))[0] as HTMLElement);
        await waitFor(() => {
            expect(screen.getByTestId('where')).toHaveTextContent(`/host/${GAME.gameId}`);
        });
        expect(JSON.parse(calls('POST', '/api/v1/games')[0]?.[1]?.body as string)).toEqual({ quizId: Q1.id });
    });

    it('ACTIVE_GAME_EXISTS navigates to existing game', async () => {
        respond({
            ...base,
            'POST /api/v1/games': { status: 409, body: { code: 'ACTIVE_GAME_EXISTS', gameId: GAME.gameId } },
        });
        renderAt('/studio');
        const user = userEvent.setup();
        await user.click((await screen.findAllByRole('button', { name: en.studio.startGame }))[0] as HTMLElement);
        await waitFor(() => {
            expect(screen.getByTestId('where')).toHaveTextContent(`/host/${GAME.gameId}`);
        });
    });

    it('delete asks confirmation then calls DELETE and removes card', async () => {
        respond({ ...base, [`DELETE /api/v1/quizzes/${Q1.id}`]: { status: 204 } });
        renderAt('/studio');
        const user = userEvent.setup();
        await screen.findByText('Pub quiz');
        await user.click(screen.getAllByRole('button', { name: en.studio.more })[0] as HTMLElement);
        await user.click(screen.getByRole('menuitem', { name: en.common.delete }));
        const dialog = screen.getByRole('dialog');
        expect(calls('DELETE', `/api/v1/quizzes/${Q1.id}`)).toHaveLength(0);
        await user.click(within(dialog).getByRole('button', { name: en.common.delete }));
        await waitFor(() => {
            expect(screen.queryByText('Pub quiz')).not.toBeInTheDocument();
        });
        expect(calls('DELETE', `/api/v1/quizzes/${Q1.id}`)).toHaveLength(1);
        expect(screen.getByText('Movies')).toBeInTheDocument();
    });

    it('create quiz posts a valid default quiz and opens the editor', async () => {
        respond({ ...base, 'POST /api/v1/quizzes': { status: 201, body: { ...Q1, id: 'new-id', questions: [] } } });
        renderAt('/studio');
        const user = userEvent.setup();
        await screen.findByText('Pub quiz');
        await user.click(screen.getAllByRole('button', { name: en.studio.createQuiz })[0] as HTMLElement);
        await waitFor(() => {
            expect(screen.getByTestId('where')).toHaveTextContent('/studio/quizzes/new-id');
        });
        const sent = JSON.parse(calls('POST', '/api/v1/quizzes')[0]?.[1]?.body as string) as unknown;
        expect(quizInputSchema.safeParse(sent).success).toBe(true);
    });
});

describe('packs page', () => {
    it('filter EN requests ?language=en', async () => {
        respond({ ...base, 'GET /api/v1/packs?language=en': { body: [PACK] } });
        renderAt('/studio/packs');
        const user = userEvent.setup();
        await screen.findByText('World capitals');
        const group = screen.getByRole('group', { name: en.studio.packLanguage });
        await user.click(within(group).getByRole('button', { name: 'EN' }));
        await waitFor(() => {
            expect(calls('GET', '/api/v1/packs?language=en')).toHaveLength(1);
        });
    });

    it('copy shows toast with open action', async () => {
        const copy = { ...Q1, id: 'copy-id', title: PACK.title, questions: [] };
        respond({ ...base, [`POST /api/v1/packs/${PACK.id}/copy`]: { status: 201, body: copy } });
        renderAt('/studio/packs');
        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: en.studio.copyPack }));
        expect(await screen.findByText(en.studio.packCopied(PACK.title))).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: en.studio.open }));
        await waitFor(() => {
            expect(screen.getByTestId('where')).toHaveTextContent('/studio/quizzes/copy-id');
        });
    });
});

describe('pack view', () => {
    it('shows questions read-only with the correct answer', async () => {
        const pack = {
            ...PACK,
            settings: {
                advanceMode: 'manual',
                autoAdvanceSeconds: 8,
                defaultTimeLimitSeconds: 20,
                earlyClose: true,
                leaderboardEvery: 5,
            },
            questions: [
                {
                    id: 'a',
                    position: 0,
                    type: 'single_choice',
                    text: 'Capital of France?',
                    imageId: null,
                    timeLimitSeconds: null,
                    multiplier: 1,
                    options: ['Paris', 'Rome'],
                    correctOption: 0,
                    numericAnswer: null,
                    numericTolerance: null,
                },
            ],
        };
        respond({ ...base, [`GET /api/v1/packs/${PACK.id}`]: { body: pack } });
        renderAt(`/studio/packs/${PACK.id}`);
        expect(await screen.findByText('Capital of France?')).toBeInTheDocument();
        expect(screen.getByText('Rome')).toBeInTheDocument();
        expect(screen.getByText(en.studio.correct)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: en.studio.copyPack })).toBeInTheDocument();
    });
});

describe('newQuizInput', () => {
    it.each([
        ['ru', ru],
        ['en', en],
    ] as const)('passes quizInputSchema for %s', (lang, dict) => {
        const input = newQuizInput(dict, lang);
        expect(quizInputSchema.safeParse(input).success).toBe(true);
        expect(input.language).toBe(lang);
        expect(input.title).toBe(dict.studio.newQuizTitle);
    });
});
