import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken, type Schemas } from '../../api/client';
import { gameStats } from '../../api/history';
import { AuthProvider } from '../../auth/AuthProvider';
import { en } from '../../i18n/en';
import { ru } from '../../i18n/ru';
import { I18nProvider } from '../../i18n/i18n';
import { ThemeProvider } from '../../theme/theme';
import { ToastProvider } from '../../ui/Toast';
import { HistoryDetailPage } from './HistoryDetailPage';
import { HistoryPage } from './HistoryPage';
import { StudioLayout } from './StudioLayout';

type Detail = Schemas['GameDetail'];
type Question = Schemas['HistoryQuestion'];

const ME = { id: '11111111-1111-4111-8111-111111111111', email: 'host@example.com' };
const GAME_ID = '55555555-5555-4555-8555-555555555551';
const DONE_ID = '55555555-5555-4555-8555-555555555552';

const SUMMARY_ABORTED: Schemas['GameSummary'] = {
    gameId: GAME_ID,
    quizTitle: 'Pub quiz',
    status: 'aborted',
    startedAt: '2026-10-21T10:00:00.000Z',
    endedAt: '2026-10-21T10:23:00.000Z',
    playerCount: 7,
    winner: { nickname: 'Zed', score: 2680 },
};
const SUMMARY_DONE: Schemas['GameSummary'] = {
    ...SUMMARY_ABORTED,
    gameId: DONE_ID,
    quizTitle: 'Movies',
    status: 'completed',
    winner: null,
};

function question(position: number, answers: { correct: boolean }[], over: Partial<Question> = {}): Question {
    return {
        position,
        type: 'single_choice',
        text: `Question ${String(position)}`,
        options: ['a', 'b'],
        correctOption: 0,
        numericAnswer: null,
        numericTolerance: null,
        multiplier: 1,
        answers: answers.map((a, i) => ({
            playerId: `p${String(i)}`,
            answer: { kind: 'option', option: a.correct ? 0 : 1 },
            activeMs: 1000,
            points: a.correct ? 800 : 0,
            correct: a.correct,
        })),
        ...over,
    };
}

const DETAIL: Detail = {
    gameId: GAME_ID,
    quizTitle: 'Pub quiz',
    status: 'aborted',
    startedAt: SUMMARY_ABORTED.startedAt,
    endedAt: SUMMARY_ABORTED.endedAt,
    players: [
        { playerId: 'p0', nickname: 'Zed', finalScore: 2680, finalRank: 1 },
        { playerId: 'p1', nickname: 'Amy', finalScore: 900, finalRank: 2 },
    ],
    questions: [
        question(0, [{ correct: true }, { correct: true }], { multiplier: 2 }),
        question(1, [{ correct: true }, { correct: false }], { type: 'true_false', text: 'Is it so' }),
        question(2, [], {
            type: 'numeric',
            text: 'How many',
            correctOption: null,
            numericAnswer: 5,
            numericTolerance: 1,
        }),
    ],
};

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function respond(routes: Record<string, { status?: number; body?: unknown }>) {
    fetchMock.mockImplementation((url, init) => {
        const r = routes[`${init?.method ?? 'GET'} ${url}`] ?? { status: 500, body: { code: 'INTERNAL_ERROR' } };
        return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status ?? 200 }));
    });
}

const base = {
    'GET /api/v1/auth/me': { body: ME },
    'GET /api/v1/auth/csrf': { body: { token: 't' } },
    'GET /api/v1/games/active': { status: 404, body: { code: 'NOT_FOUND' } },
};

function renderAt(path: string) {
    return render(
        <ThemeProvider>
            <I18nProvider initial="en">
                <ToastProvider>
                    <MemoryRouter initialEntries={[path]}>
                        <AuthProvider>
                            <Routes>
                                <Route path="/studio" element={<StudioLayout />}>
                                    <Route index element={<div>quizzes page</div>} />
                                    <Route path="history" element={<HistoryPage />} />
                                    <Route path="history/:gameId" element={<HistoryDetailPage />} />
                                </Route>
                            </Routes>
                        </AuthProvider>
                    </MemoryRouter>
                </ToastProvider>
            </I18nProvider>
        </ThemeProvider>,
    );
}

beforeEach(() => {
    fetchMock.mockReset();
    setCsrfToken(null);
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    setCsrfToken(null);
});

describe('gameStats', () => {
    it('counts played questions and correct share', () => {
        expect(gameStats(DETAIL)).toEqual({ players: 2, playedQuestions: 2, correctShare: 0.75 });
    });

    it('has no correct share without answers', () => {
        expect(gameStats({ ...DETAIL, questions: [question(0, [])] }).correctShare).toBeNull();
    });
});

describe('history page', () => {
    it('history shows aborted badge and winner', async () => {
        respond({ ...base, 'GET /api/v1/history': { body: [SUMMARY_ABORTED, SUMMARY_DONE] } });
        renderAt('/studio/history');
        const row = (await screen.findByText('Pub quiz')).closest('tr') as HTMLElement;
        expect(within(row).getByText(en.studio.statusAborted)).toBeInTheDocument();
        expect(within(row).getByText(/Zed/)).toHaveTextContent('2,680');
        expect(within(row).getByRole('link', { name: en.studio.details })).toHaveAttribute(
            'href',
            `/studio/history/${GAME_ID}`,
        );
        const done = screen.getByText('Movies').closest('tr') as HTMLElement;
        expect(within(done).getByText(en.studio.statusCompleted)).toBeInTheDocument();
        expect(within(done).getByText('—', { selector: '.winner-none' })).toBeInTheDocument();
        expect(screen.getByText(en.studio.historyNote)).toBeInTheDocument();
    });

    it('every game row keeps quiz, status and details link, laid out as cards on narrow screens', async () => {
        respond({ ...base, 'GET /api/v1/history': { body: [SUMMARY_ABORTED, SUMMARY_DONE] } });
        renderAt('/studio/history');
        const table = await screen.findByRole('table');
        expect(table).toHaveClass('tbl-cards');
        expect(within(table).getAllByRole('columnheader')).toHaveLength(6);
        const rows = within(table).getAllByRole('row').slice(1);
        expect(rows).toHaveLength(2);
        for (const row of rows) {
            const cells = within(row).getAllByRole('cell');
            expect(cells.map((c) => c.getAttribute('data-col'))).toEqual([
                'date',
                'quiz',
                'players',
                'winner',
                'status',
                'details',
            ]);
            expect(within(row).getByRole('link', { name: en.studio.details })).toBeInTheDocument();
        }
        expect(within(rows[0] as HTMLElement).getByText('Pub quiz')).toHaveAttribute('data-col', 'quiz');
    });

    it('empty history shows hint', async () => {
        respond({ ...base, 'GET /api/v1/history': { body: [] } });
        renderAt('/studio/history');
        expect(await screen.findByText(en.studio.historyEmpty)).toBeInTheDocument();
        const empty = screen.getByText(en.studio.historyEmpty).closest('section') as HTMLElement;
        expect(within(empty).getByRole('link', { name: en.studio.historyEmptyLink })).toHaveAttribute(
            'href',
            '/studio',
        );
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
});

describe('players label', () => {
    it('pluralises in EN and RU', () => {
        expect([1, 2, 5].map((n) => en.studio.playersCount(n))).toEqual(['1 player', '2 players', '5 players']);
        expect([1, 2, 5, 11, 21].map((n) => ru.studio.playersCount(n))).toEqual([
            '1 игрок',
            '2 игрока',
            '5 игроков',
            '11 игроков',
            '21 игрок',
        ]);
    });

    it('history row shows the label with an aria-hidden separator', async () => {
        respond({ ...base, 'GET /api/v1/history': { body: [SUMMARY_ABORTED] } });
        renderAt('/studio/history');
        const row = (await screen.findByText('Pub quiz')).closest('tr') as HTMLElement;
        const cell = within(row).getByText(en.studio.playersCount(7), { exact: false });
        expect(cell).toHaveTextContent('7 players');
        expect(cell.querySelector('[aria-hidden="true"]')).not.toBeNull();
    });
});

describe('history detail page', () => {
    it('detail of aborted game shows banner with N of M', async () => {
        respond({ ...base, [`GET /api/v1/history/${GAME_ID}`]: { body: DETAIL } });
        renderAt(`/studio/history/${GAME_ID}`);
        expect(await screen.findByText(en.studio.abortedBanner(2, 3))).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Pub quiz' })).toBeInTheDocument();
        expect(screen.getByText('75%')).toBeInTheDocument();
        const rows = within(screen.getAllByRole('table')[1] as HTMLElement).getAllByRole('row');
        expect(within(rows[1] as HTMLElement).getAllByRole('cell')[0]).toHaveTextContent('1');
        expect(within(rows[2] as HTMLElement).getByText(en.studio.typeTrueFalse)).toBeInTheDocument();
        expect(within(rows[3] as HTMLElement).getByText(en.studio.typeNumeric)).toBeInTheDocument();
        const [standings, questions] = screen.getAllByRole('table');
        expect(standings).not.toHaveClass('tbl-wide');
        expect(questions).toHaveClass('tbl-wide');
        expect(screen.getByText('x2')).toBeInTheDocument();
        expect(screen.getByText(en.studio.correctOf(2, 2))).toBeInTheDocument();
        expect(screen.getByText(en.studio.correctOf(0, 0))).toBeInTheDocument();
    });

    it('completed game has no banner', async () => {
        respond({
            ...base,
            [`GET /api/v1/history/${GAME_ID}`]: { body: { ...DETAIL, status: 'completed' } },
        });
        renderAt(`/studio/history/${GAME_ID}`);
        await screen.findByRole('heading', { name: 'Pub quiz' });
        expect(screen.queryByText(en.studio.abortedBanner(2, 3))).not.toBeInTheDocument();
    });

    it('unknown game shows NOT_FOUND text and a link back', async () => {
        respond({ ...base, [`GET /api/v1/history/${GAME_ID}`]: { status: 404, body: { code: 'NOT_FOUND' } } });
        renderAt(`/studio/history/${GAME_ID}`);
        expect(await screen.findByText(en.errors.NOT_FOUND)).toBeInTheDocument();
        expect(
            within(screen.getByRole('main')).getByRole('link', { name: new RegExp(en.studio.historyBack) }),
        ).toHaveAttribute('href', '/studio/history');
    });
});
