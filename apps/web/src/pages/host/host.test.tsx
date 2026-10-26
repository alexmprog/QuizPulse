import type { HostView } from '@quizpulse/protocol';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from '../../api/client';
import { AuthProvider } from '../../auth/AuthProvider';
import { RequireAuth } from '../../auth/RequireAuth';
import { en } from '../../i18n/en';
import { LoginPage } from '../auth/LoginPage';
import { I18nProvider } from '../../i18n/i18n';
import { FakeSocket } from '../../test/fakeSocket';
import { countdown, hostView, question } from '../../test/fixtures';
import { ThemeProvider } from '../../theme/theme';
import { ToastProvider } from '../../ui/Toast';
import { HostPage } from './HostPage';

const GAME_ID = '77777777-7777-4777-8777-777777777771';

function setup() {
    const fake = new FakeSocket();
    fake.reply('host:join', { ok: true });
    const user = userEvent.setup();
    const utils = render(
        <ThemeProvider>
            <I18nProvider initial="en">
                <ToastProvider>
                    <MemoryRouter initialEntries={[`/host/${GAME_ID}`]}>
                        <Routes>
                            <Route path="/host/:gameId" element={<HostPage socketFactory={fake.factory} />} />
                            <Route path="/studio" element={<p>studio page</p>} />
                        </Routes>
                    </MemoryRouter>
                </ToastProvider>
            </I18nProvider>
        </ThemeProvider>,
    );
    const show = (v: HostView) => {
        act(() => {
            fake.connect();
            fake.serverEmit('host:state', v);
        });
    };
    return { fake, user, show, ...utils };
}

/** Lets resolved ack promises reach the page. */
async function flush(): Promise<void> {
    await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
    });
}

const openQuestion = (over: Partial<HostView> = {}) =>
    hostView({ phase: 'question_open', question: question(), countdown: countdown(20_000), ...over });

describe('host lobby', () => {
    it('lobby renders QR svg, spaced PIN and disables start without players', () => {
        const { show, container } = setup();
        show(hostView({ pin: '482931', joinUrl: 'http://192.168.1.42:8080/play?pin=482931' }));
        const qr = screen.getByRole('img', { name: 'QR code with the game link' });
        expect(qr.tagName.toLowerCase()).toBe('svg');
        expect(qr.querySelector('path')).not.toBeNull();
        expect(screen.getByText('482 931')).toBeInTheDocument();
        expect(screen.getByText('192.168.1.42:8080/play')).toBeInTheDocument();
        expect(screen.getByText('2 / 50')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
        expect(container.textContent).not.toContain('?pin');

        show(hostView({ players: [] }));
        expect(screen.getByText('Waiting for players…')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    });

    it('the QR svg draws a white 4-module quiet zone around the code', () => {
        const { show } = setup();
        show(hostView({ joinUrl: 'http://192.168.1.42:8080/play?pin=123456' }));
        const qr = screen.getByRole('img', { name: 'QR code with the game link' });
        const [x, y, w, h] = (qr.getAttribute('viewBox') ?? '').split(' ').map(Number);
        expect([x, y]).toEqual([-4, -4]);
        expect(w).toBe(h);
        const rect = qr.querySelector('rect');
        expect(rect).not.toBeNull();
        expect(rect?.getAttribute('fill')).toBe('#ffffff');
        expect([rect?.getAttribute('x'), rect?.getAttribute('y'), rect?.getAttribute('width')]).toEqual([
            '-4',
            '-4',
            String(w),
        ]);
        // The modules stay inside 0..size: the 4 modules on each side are empty.
        const size = (w ?? 0) - 8;
        const d = qr.querySelector('path')?.getAttribute('d') ?? '';
        const coords = [...d.matchAll(/M(\d+) (\d+)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
        expect(Math.min(...coords)).toBe(0);
        expect(Math.max(...coords)).toBe(size - 1);
    });

    it('warns under the join address when the link points at localhost', () => {
        const { show, container } = setup();
        show(hostView({ joinUrl: 'http://localhost:8080/play?pin=123456' }));
        expect(screen.getByText(en.host.localJoinUrl)).toBeInTheDocument();
        show(hostView({ joinUrl: 'http://127.0.0.1:8080/play?pin=123456' }));
        expect(screen.getByText(en.host.localJoinUrl)).toBeInTheDocument();
        // The QR gives up room for the warning so the join card still fits.
        expect(container.querySelector('.host-qr-box')).toHaveClass('host-qr-box-sm');
        show(hostView({ joinUrl: 'http://192.168.1.42:8080/play?pin=123456' }));
        expect(screen.queryByText(en.host.localJoinUrl)).toBeNull();
        expect(container.querySelector('.host-qr-box')).not.toHaveClass('host-qr-box-sm');
    });

    it('marks offline players and shows the legend', () => {
        const { show } = setup();
        show(
            hostView({
                players: [
                    { id: 'p1', nickname: 'Alice', connected: true, score: 0, answered: false },
                    { id: 'p2', nickname: 'Bob', connected: false, score: 0, answered: false },
                ],
            }),
        );
        const bob = screen.getByRole('button', { name: 'Remove Bob' }).closest('.pchip');
        expect(bob).toHaveClass('off');
        expect(screen.getByRole('button', { name: 'Remove Alice' }).closest('.pchip')).not.toHaveClass('off');
        expect(screen.getByText('offline')).toBeInTheDocument();
    });

    it('kick button sends host:kick with playerId', async () => {
        const { fake, show, user } = setup();
        show(hostView());
        await user.click(screen.getByRole('button', { name: 'Remove Alice' }));
        expect(fake.sent('host:kick').map((e) => e.payload)).toEqual([{ playerId: 'p1' }]);
        act(() => {
            fake.respond('host:kick', { ok: true });
        });
        await flush();
        expect(screen.getByText('Player “Alice” removed')).toBeInTheDocument();
    });

    it('start sends host:start, stays disabled until the ack and toasts a refusal', async () => {
        const { fake, show, user } = setup();
        show(hostView());
        await user.click(screen.getByRole('button', { name: 'Start' }));
        expect(fake.sent('host:start')).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
        act(() => {
            fake.respond('host:start', { ok: false, code: 'NO_PLAYERS' });
        });
        await flush();
        expect(screen.getByText('There are no players in the game yet.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
    });

    it('close game confirms, sends host:end and goes to the studio', async () => {
        const { fake, show, user } = setup();
        show(hostView());
        await user.click(screen.getByRole('button', { name: 'Close game' }));
        const dialog = screen.getByRole('dialog');
        expect(fake.sent('host:end')).toHaveLength(0);
        await user.click(within(dialog).getByRole('button', { name: 'Close game' }));
        expect(fake.sent('host:end')).toHaveLength(1);
        act(() => {
            fake.serverEmit('game:closed');
            fake.respond('host:end', { ok: true });
        });
        await flush();
        expect(screen.getByText('studio page')).toBeInTheDocument();
    });
});

describe('host question', () => {
    it('question screen hides correct answer', () => {
        const { show, container } = setup();
        show(openQuestion({ answeredCount: 1 }));
        expect(screen.getByText('Capital of France?')).toBeInTheDocument();
        for (const o of ['Paris', 'Rome', 'Oslo', 'Berlin']) expect(screen.getByText(o)).toBeInTheDocument();
        expect(container.querySelector('[class*="correct"]')).toBeNull();
        expect(screen.getByRole('timer')).toHaveTextContent('20');
        expect(screen.getByText('answered')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'End early' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    });

    it('shows the multiplier badge, the image and true/false tiles in order', () => {
        const { show } = setup();
        show(
            openQuestion({
                question: question({ type: 'true_false', options: [], multiplier: 2, imageUrl: '/img/1.jpg' }),
            }),
        );
        expect(screen.getByText('x2')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Question image' })).toHaveAttribute('src', '/img/1.jpg');
        const tiles = [...document.querySelectorAll('.opt')].map((el) => el.textContent);
        expect(tiles).toEqual(['True', 'False']);
    });

    it('numeric question asks for a number on the phone', () => {
        const { show } = setup();
        show(openQuestion({ question: question({ type: 'numeric', options: [] }) }));
        expect(screen.getByText('Type a number on your phone')).toBeInTheDocument();
    });

    it('pause screen hides question text and options', async () => {
        const { fake, show, user } = setup();
        show(
            openQuestion({
                pause: { reason: 'host' },
                countdown: countdown(17_000, { paused: true }),
                answeredCount: 1,
            }),
        );
        expect(screen.queryByText('Capital of France?')).toBeNull();
        expect(screen.queryByText('Paris')).toBeNull();
        expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument();
        expect(screen.getByText('17 s left after resume')).toBeInTheDocument();
        expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Resume' }));
        expect(fake.sent('host:resume')).toHaveLength(1);
    });

    it('host_disconnected pause warns about the absence timeout', () => {
        const { show } = setup();
        show(
            hostView({
                phase: 'leaderboard',
                pause: { reason: 'host_disconnected' },
                leaderboard: [],
                players: [
                    { id: 'p1', nickname: 'Alice', connected: true, score: 0, answered: false },
                    { id: 'p2', nickname: 'Bob', connected: false, score: 0, answered: false },
                ],
            }),
        );
        expect(screen.getByRole('heading', { name: 'Game paused' })).toBeInTheDocument();
        expect(screen.getByText('1 of 2 online')).toBeInTheDocument();
        expect(screen.getByText('Without the host, the game ends by itself after 30 minutes.')).toBeInTheDocument();
        expect(screen.queryByText(/left after resume/)).toBeNull();
    });

    it('end dialog confirms before host:end', async () => {
        const { fake, show, user } = setup();
        show(openQuestion());
        await user.click(screen.getByRole('button', { name: 'End early' }));
        const dialog = screen.getByRole('dialog', { name: 'End the game early?' });
        expect(fake.sent('host:end')).toHaveLength(0);
        await user.click(within(dialog).getByRole('button', { name: 'Keep playing' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(fake.sent('host:end')).toHaveLength(0);

        await user.click(screen.getByRole('button', { name: 'End early' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End game' }));
        expect(fake.sent('host:end')).toHaveLength(1);
    });

    it('connection lost overlay has role status and disables controls', () => {
        const { fake, show } = setup();
        show(openQuestion());
        act(() => {
            fake.drop();
        });
        const card = screen
            .getAllByRole('status')
            .find((el) => el.textContent.includes('Connection to the server lost'));
        expect(card).toBeDefined();
        expect(card).toHaveTextContent('Game auto-paused');
        expect(screen.getByText('Capital of France?')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'End early' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
    });
});

describe('host results', () => {
    const choiceResults = {
        correctOption: 0,
        numericAnswer: null,
        numericTolerance: null,
        optionCounts: [3, 1, 0, 0],
        closestNumeric: null,
        noAnswerCount: 1,
    };

    it('results mark correct option and dim others', () => {
        const { show } = setup();
        show(hostView({ phase: 'question_results', question: question(), results: choiceResults }));
        const correct = screen.getByText('Paris').closest('.host-result');
        expect(correct).toHaveClass('is-correct');
        expect(within(correct as HTMLElement).getByText('Correct answer')).toBeInTheDocument();
        expect(within(correct as HTMLElement).getByText('3')).toBeInTheDocument();
        for (const o of ['Rome', 'Oslo', 'Berlin'])
            expect(screen.getByText(o).closest('.host-result')).toHaveClass('is-dim');
        expect(screen.getByText('No answer: 1')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next →' })).toBeEnabled();
    });

    it('auto-advance countdown shows seconds from autoAdvance', () => {
        const { show } = setup();
        show(
            hostView({
                phase: 'question_results',
                question: question(),
                results: choiceResults,
                advanceMode: 'auto',
                autoAdvance: countdown(6_000),
            }),
        );
        expect(screen.getByText('Next question in 6 s')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next →' })).toBeInTheDocument();

        show(
            hostView({
                phase: 'leaderboard',
                questionIndex: 2,
                leaderboard: [],
                advanceMode: 'auto',
                autoAdvance: countdown(4_000),
            }),
        );
        expect(screen.getByText('Next question in 4 s')).toBeInTheDocument();
    });

    it('numeric results show tolerance badge for in-tolerance rows', () => {
        const { show } = setup();
        show(
            hostView({
                phase: 'question_results',
                question: question({ type: 'numeric', options: [] }),
                results: {
                    correctOption: null,
                    numericAnswer: 142,
                    numericTolerance: 5,
                    optionCounts: null,
                    closestNumeric: [
                        { nickname: 'Anna', value: 141 },
                        { nickname: 'Owl', value: 145 },
                        { nickname: 'Fox', value: 150 },
                    ],
                    noAnswerCount: 2,
                },
            }),
        );
        expect(screen.getByText('142')).toBeInTheDocument();
        expect(screen.getByText('tolerance ±5')).toBeInTheDocument();
        expect(screen.getByText('−1')).toHaveClass('badge-success');
        expect(screen.getByText('+3')).toHaveClass('badge-success');
        expect(screen.getByText('+8')).not.toHaveClass('badge-success');
        expect(screen.getByText('No answer: 2')).toBeInTheDocument();
    });

    it('leaderboard shows the top 10 and names the next question', async () => {
        const { fake, show, user } = setup();
        const leaderboard = Array.from({ length: 12 }, (_, i) => ({
            playerId: `p${String(i)}`,
            nickname: `Player ${String(i + 1)}`,
            score: 1000 - i * 10,
            rank: i + 1,
        }));
        show(hostView({ phase: 'leaderboard', questionIndex: 2, questionCount: 5, leaderboard }));
        expect(screen.getByText('Player 10')).toBeInTheDocument();
        expect(screen.queryByText('Player 11')).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Question 4 →' }));
        expect(fake.sent('host:next')).toHaveLength(1);

        show(hostView({ phase: 'leaderboard', questionIndex: 4, questionCount: 5, leaderboard }));
        expect(screen.getByRole('button', { name: 'Final results →' })).toBeInTheDocument();
    });
});

describe('host final', () => {
    const leaderboard = [
        { playerId: 'p1', nickname: 'Alice', score: 900, rank: 1 },
        { playerId: 'p2', nickname: 'Bob', score: 800, rank: 2 },
        { playerId: 'p3', nickname: 'Cara', score: 700, rank: 3 },
        { playerId: 'p4', nickname: 'Dan', score: 600, rank: 4 },
    ];

    it('shows the podium 2–1–3 and toggles the full table', async () => {
        const { show, user } = setup();
        show(hostView({ phase: 'finished', outcome: 'completed', leaderboard }));
        expect(screen.getByText('Game over!')).toBeInTheDocument();
        expect(screen.getByText('Completed')).toBeInTheDocument();
        const places = [...document.querySelectorAll('.host-podium-nick')].map((el) => el.textContent);
        expect(places).toEqual(['Bob', 'Alice', 'Cara']);
        expect(screen.queryByText('Dan')).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Full table' }));
        expect(screen.getByText('Dan')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Podium' }));
        expect(screen.queryByText('Dan')).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Back to studio' }));
        expect(screen.getByText('studio page')).toBeInTheDocument();
    });

    it('aborted final shows badge and question N of M', () => {
        const { show } = setup();
        show(hostView({ phase: 'finished', outcome: 'aborted', questionIndex: 6, questionCount: 12, leaderboard }));
        expect(screen.getByText('Aborted')).toBeInTheDocument();
        expect(screen.getByText('The host ended the game on question 7 of 12')).toBeInTheDocument();
    });
});

describe('host fatal', () => {
    it('NOT_HOST shows game not found with a studio link', async () => {
        const fake = new FakeSocket();
        fake.reply('host:join', { ok: false, code: 'NOT_HOST' });
        render(
            <ThemeProvider>
                <I18nProvider initial="en">
                    <ToastProvider>
                        <MemoryRouter initialEntries={[`/host/${GAME_ID}`]}>
                            <Routes>
                                <Route path="/host/:gameId" element={<HostPage socketFactory={fake.factory} />} />
                            </Routes>
                        </MemoryRouter>
                    </ToastProvider>
                </I18nProvider>
            </ThemeProvider>,
        );
        act(() => {
            fake.connect();
        });
        await flush();
        expect(screen.getByRole('heading', { name: 'Game not found' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Back to studio' })).toHaveAttribute('href', '/studio');
    });
});

describe('host session', () => {
    it('host:join UNAUTHENTICATED with a cached me lands on /login once, without bouncing back', async () => {
        setCsrfToken(null);
        const me = { id: '11111111-1111-4111-8111-111111111111', email: 'host@example.com' };
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) =>
                Promise.resolve(
                    url === '/api/v1/auth/me'
                        ? new Response(JSON.stringify(me), { status: 200 })
                        : new Response(JSON.stringify({ code: 'INTERNAL_ERROR' }), { status: 500 }),
                ),
            ),
        );
        const fake = new FakeSocket();
        fake.reply('host:join', { ok: false, code: 'UNAUTHENTICATED' });
        function Where() {
            const l = useLocation();
            return <output data-testid="where">{l.pathname + l.search}</output>;
        }
        const { container } = render(
            <ThemeProvider>
                <I18nProvider initial="en">
                    <ToastProvider>
                        <MemoryRouter initialEntries={[`/host/${GAME_ID}`]}>
                            <AuthProvider>
                                <Routes>
                                    <Route path="/login" element={<LoginPage />} />
                                    <Route
                                        path="/host/:gameId"
                                        element={
                                            <RequireAuth>
                                                <HostPage socketFactory={fake.factory} />
                                            </RequireAuth>
                                        }
                                    />
                                </Routes>
                                <Where />
                            </AuthProvider>
                        </MemoryRouter>
                    </ToastProvider>
                </I18nProvider>
            </ThemeProvider>,
        );
        // The host screen mounts once `me` is loaded.
        await waitFor(() => {
            expect(container.querySelector('.host-loading')).not.toBeNull();
        });
        act(() => {
            fake.connect();
        });
        await flush();
        expect(await screen.findByRole('button', { name: en.auth.login })).toBeInTheDocument();
        await flush();
        expect(screen.getByTestId('where')).toHaveTextContent(`/login?next=/host/${GAME_ID}`);
        expect(fake.sent('host:join')).toHaveLength(1);
    });
});
