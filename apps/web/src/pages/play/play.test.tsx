import type { PlayerView } from '@quizpulse/protocol';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { loadSession, saveSession } from '../../game/playerSession';
import { I18nProvider, type Lang } from '../../i18n/i18n';
import { FakeSocket } from '../../test/fakeSocket';
import { countdown, playerView, question } from '../../test/fixtures';
import { ThemeProvider } from '../../theme/theme';
import { PlayPage } from './PlayPage';

function Where() {
    const l = useLocation();
    return <output data-testid="where">{l.pathname + l.search}</output>;
}

function setup({ url = '/play', lang = 'en' }: { url?: string; lang?: Lang } = {}) {
    const fake = new FakeSocket();
    const user = userEvent.setup();
    const utils = render(
        <ThemeProvider>
            <I18nProvider initial={lang}>
                <MemoryRouter initialEntries={[url]}>
                    <Routes>
                        <Route
                            path="/play/*"
                            element={
                                <>
                                    <PlayPage socketFactory={fake.factory} />
                                    <Where />
                                </>
                            }
                        />
                    </Routes>
                </MemoryRouter>
            </I18nProvider>
        </ThemeProvider>,
    );
    const connect = () => {
        act(() => {
            fake.connect();
        });
    };
    const show = (v: PlayerView) => {
        act(() => {
            fake.connect();
            fake.serverEmit('player:state', v);
        });
    };
    const where = () => screen.getByTestId('where').textContent;
    return { fake, user, connect, show, where, ...utils };
}

/** Lets resolved ack promises reach the page. */
async function flush(): Promise<void> {
    await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
    });
}

const open = (over: Partial<PlayerView> = {}) =>
    playerView({ phase: 'question_open', question: question(), countdown: countdown(20_000), ...over });

describe('play join', () => {
    it('pin screen accepts only digits; successful lookup puts pin into url and shows quiz title', async () => {
        const { fake, user, connect, where } = setup();
        connect();
        fake.reply('player:lookup', { ok: true, quizTitle: 'Pub quiz' });
        const pin = screen.getByLabelText('Game PIN');
        expect(pin).toHaveAttribute('inputmode', 'numeric');
        await user.type(pin, '12a3 45-678');
        expect(pin).toHaveValue('123456');
        await user.click(screen.getByRole('button', { name: 'Next' }));
        await flush();
        expect(fake.sent('player:lookup').map((e) => e.payload)).toEqual([{ pin: '123456' }]);
        expect(where()).toBe('/play?pin=123456');
        expect(screen.getByText('Pub quiz')).toBeInTheDocument();
        expect(screen.getByText('Game · PIN 123 456')).toBeInTheDocument();
        expect(screen.getByLabelText('Nickname or team name')).toBeInTheDocument();
        // The URL change does not ask the server a second time.
        expect(fake.sent('player:lookup')).toHaveLength(1);
    });

    it('a pasted PIN with a space keeps all six digits', async () => {
        const { user, connect } = setup();
        connect();
        const pin = screen.getByLabelText('Game PIN');
        expect(pin).not.toHaveAttribute('maxlength');
        await user.click(pin);
        await user.paste('482 931');
        expect(pin).toHaveValue('482931');
        expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    });

    it('a PIN from the QR link is looked up first and shows the quiz title', async () => {
        const { fake, connect } = setup({ url: '/play?pin=482931' });
        fake.reply('player:lookup', { ok: true, quizTitle: 'Movies of the 90s' });
        connect();
        await flush();
        expect(fake.sent('player:lookup').map((e) => e.payload)).toEqual([{ pin: '482931' }]);
        expect(screen.getByText('Movies of the 90s')).toBeInTheDocument();
        expect(screen.getByLabelText('Nickname or team name')).toBeInTheDocument();
    });

    it('lookup GAME_NOT_FOUND keeps pin screen with error and digits', async () => {
        const { fake, user, connect, where } = setup();
        connect();
        fake.reply('player:lookup', { ok: false, code: 'GAME_NOT_FOUND' });
        await user.type(screen.getByLabelText('Game PIN'), '482931');
        await user.click(screen.getByRole('button', { name: 'Next' }));
        await flush();
        const pin = screen.getByLabelText('Game PIN');
        expect(pin).toHaveValue('482931');
        expect(pin).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByText('No game with PIN 482 931. Check the digits on the host screen.')).toBeInTheDocument();
        expect(where()).toBe('/play');
    });

    it('NICKNAME_TAKEN marks nickname field', async () => {
        const { fake, user, connect } = setup({ url: '/play?pin=123456' });
        fake.reply('player:lookup', { ok: true, quizTitle: 'Pub quiz' });
        fake.reply('player:join', { ok: false, code: 'NICKNAME_TAKEN' });
        connect();
        await flush();
        const nick = screen.getByLabelText('Nickname or team name');
        await user.type(nick, '  Cat  ');
        expect(screen.getByText('3 / 20')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Join' }));
        await flush();
        expect(fake.sent('player:join').map((e) => e.payload)).toEqual([{ pin: '123456', nickname: 'Cat' }]);
        expect(nick).toHaveAttribute('aria-invalid', 'true');
        expect(
            screen.getByText('The nickname “Cat” is already taken in this game. Pick another one.'),
        ).toBeInTheDocument();
    });

    it('GAME_FULL shows join error screen', async () => {
        const { fake, user, connect, where } = setup({ url: '/play?pin=123456' });
        fake.reply('player:lookup', { ok: true, quizTitle: 'Pub quiz' });
        fake.reply('player:join', { ok: false, code: 'GAME_FULL' });
        connect();
        await flush();
        await user.type(screen.getByLabelText('Nickname or team name'), 'Cat');
        await user.click(screen.getByRole('button', { name: 'Join' }));
        await flush();
        expect(screen.getByRole('heading', { name: 'No seats left' })).toBeInTheDocument();
        expect(screen.getByText(/already has 50 players/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Enter another PIN' }));
        expect(screen.getByRole('heading', { name: 'Join a game' })).toBeInTheDocument();
        expect(screen.getByLabelText('Game PIN')).toHaveValue('');
        expect(where()).toBe('/play');
    });

    it('GAME_ALREADY_STARTED from the QR lookup shows join error screen', async () => {
        const { fake, connect } = setup({ url: '/play?pin=123456' });
        fake.reply('player:lookup', { ok: false, code: 'GAME_ALREADY_STARTED' });
        connect();
        await flush();
        expect(screen.getByRole('heading', { name: 'The game has started' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Enter another PIN' })).toBeInTheDocument();
    });

    it('other join refusals show their text under the form', async () => {
        const { fake, user, connect } = setup({ url: '/play?pin=123456' });
        fake.reply('player:lookup', { ok: true, quizTitle: 'Pub quiz' });
        fake.reply('player:join', { ok: false, code: 'RATE_LIMITED' });
        connect();
        await flush();
        await user.type(screen.getByLabelText('Nickname or team name'), 'Cat');
        await user.click(screen.getByRole('button', { name: 'Join' }));
        await flush();
        expect(screen.getByText('Too many attempts. Please wait a moment.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
    });

    it('while a saved session is restored a spinner shows instead of the join form', () => {
        saveSession({ pin: '123456', gameId: 'g1', playerId: 'p1', playerToken: 'tok' });
        const { connect } = setup({ url: '/play?pin=123456' });
        connect();
        expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Nickname or team name')).toBeNull();
        expect(screen.queryByLabelText('Game PIN')).toBeNull();
    });

    it('shows the language and theme switch on the PIN screen and in the lobby only', () => {
        const { connect, show } = setup();
        connect();
        expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
        show(playerView());
        expect(screen.getByText('You’re in')).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
        show(open());
        expect(screen.queryByRole('group', { name: 'Language' })).toBeNull();
    });
});

describe('play answer', () => {
    it('choice options fill the screen with shape and text, without the question text', () => {
        const { show } = setup();
        show(open({ questionIndex: 2, questionCount: 12, me: { id: 'p1', nickname: 'Alice', score: 1840, rank: 2 } }));
        expect(screen.queryByText('Capital of France?')).toBeNull();
        expect(screen.getByText('The question is on the big screen')).toBeInTheDocument();
        expect(screen.getByText('3 / 12')).toBeInTheDocument();
        expect(screen.getByText('1,840')).toBeInTheDocument();
        expect(screen.getByRole('timer')).toHaveTextContent('20');
        const names = screen.getAllByRole('button').map((b) => b.textContent);
        expect(names).toEqual(['Paris', 'Rome', 'Oslo', 'Berlin']);
    });

    it('true/false screen renders Правда first and sends option 0', async () => {
        const { fake, user, show } = setup({ lang: 'ru' });
        show(open({ question: question({ type: 'true_false', options: [] }) }));
        const [first, second] = screen.getAllByRole('button');
        expect(first).toHaveTextContent('Правда');
        expect(first).toHaveClass('opt-b');
        expect(second).toHaveTextContent('Ложь');
        expect(second).toHaveClass('opt-a');
        if (!first) throw new Error('no button');
        await user.click(first);
        expect(fake.sent('player:answer').map((e) => e.payload)).toEqual([
            { questionIndex: 0, answer: { kind: 'option', option: 0 } },
        ]);
        // In flight: both buttons are off until the ack.
        expect(screen.getByRole('button', { name: 'Правда' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Ложь' })).toBeDisabled();
    });

    it('numeric answer accepts comma decimal and sends value 3.5', async () => {
        const { fake, user, show } = setup();
        show(open({ question: question({ type: 'numeric', options: [] }) }));
        const input = screen.getByLabelText('Your answer — a number');
        expect(input).toHaveAttribute('inputmode', 'decimal');
        expect(screen.getByText('You can answer only once')).toBeInTheDocument();
        await user.type(input, '3,5');
        await user.click(screen.getByRole('button', { name: 'Submit' }));
        expect(fake.sent('player:answer').map((e) => e.payload)).toEqual([
            { questionIndex: 0, answer: { kind: 'numeric', value: 3.5 } },
        ]);
    });

    it('a refused answer leaves the screen usable with a quiet note', async () => {
        const { fake, user, show } = setup();
        show(open());
        await user.click(screen.getByRole('button', { name: 'Rome' }));
        act(() => {
            fake.respond('player:answer', { ok: false, code: 'QUESTION_CLOSED' });
        });
        await flush();
        expect(screen.getByText('Time to answer is over.')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByRole('button', { name: 'Rome' })).toBeEnabled();
        // The next snapshot corrects the screen.
        show(playerView({ phase: 'question_results', question: question(), answered: false }));
        expect(screen.getByText('Time’s up')).toBeInTheDocument();
    });

    it('accepted screen shows tile from myAnswer; no tile when myAnswer is null', () => {
        const { show, container } = setup();
        show(open({ answered: true, myAnswer: { kind: 'option', option: 2 } }));
        expect(screen.getByRole('heading', { name: 'Answer locked in' })).toBeInTheDocument();
        const tile = container.querySelector('.opt');
        expect(tile).toHaveTextContent('Oslo');
        expect(tile).toHaveClass('opt-c');
        expect(screen.getByText('You’ll find out if it’s right when time runs out.')).toBeInTheDocument();

        show(open({ answered: true, myAnswer: null }));
        expect(screen.getByRole('heading', { name: 'Answer locked in' })).toBeInTheDocument();
        expect(container.querySelector('.opt')).toBeNull();
        expect(container.querySelector('.play-chosen-number')).toBeNull();
    });

    it('accepted screen shows the true/false tile and the number as answered', () => {
        const { show, container } = setup();
        show(
            open({
                question: question({ type: 'true_false', options: [] }),
                answered: true,
                myAnswer: { kind: 'option', option: 0 },
            }),
        );
        expect(container.querySelector('.opt')).toHaveTextContent('True');
        expect(container.querySelector('.opt')).toHaveClass('opt-b');

        show(
            open({
                question: question({ type: 'numeric', options: [] }),
                answered: true,
                myAnswer: { kind: 'numeric', value: 3.5 },
            }),
        );
        expect(container.querySelector('.play-chosen-number')).toHaveTextContent('3.5');
    });
});

describe('play phases', () => {
    it('pause hides the answer buttons and names the reason', () => {
        const { show } = setup();
        show(open({ pause: { reason: 'host' } }));
        expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument();
        expect(screen.queryByRole('button')).toBeNull();
        show(open({ pause: { reason: 'host_disconnected' } }));
        expect(screen.getByRole('heading', { name: 'Waiting for the host' })).toBeInTheDocument();
        expect(screen.getByText(/your score is safe/)).toBeInTheDocument();
    });

    it('correct and wrong results use success and danger tones', () => {
        const { show, container } = setup();
        show(
            playerView({
                phase: 'question_results',
                answered: true,
                myResult: { correct: true, points: 840 },
                me: { id: 'p1', nickname: 'Alice', score: 2680, rank: 1 },
            }),
        );
        expect(screen.getByRole('heading', { name: 'Correct!' })).toBeInTheDocument();
        expect(screen.getByText('+840')).toBeInTheDocument();
        expect(screen.getByText('2,680')).toBeInTheDocument();
        expect(container.querySelector('.play-tone-success')).not.toBeNull();

        show(playerView({ phase: 'question_results', answered: true, myResult: { correct: false, points: 0 } }));
        expect(screen.getByRole('heading', { name: 'Wrong' })).toBeInTheDocument();
        expect(screen.getByText('+0')).toBeInTheDocument();
        expect(screen.getByText('The correct answer is on the big screen')).toBeInTheDocument();
        expect(container.querySelector('.play-tone-danger')).not.toBeNull();
    });

    it('a wrong numeric guess with consolation points shows them and says why', () => {
        const { show, container } = setup();
        show(
            playerView({
                phase: 'question_results',
                answered: true,
                myResult: { correct: false, points: 500 },
                me: { id: 'p1', nickname: 'Alice', score: 1500, rank: 2 },
            }),
        );
        expect(screen.getByRole('heading', { name: 'Wrong' })).toBeInTheDocument();
        expect(screen.getByText('+500')).toBeInTheDocument();
        expect(screen.getByText('Closest guess — consolation points')).toBeInTheDocument();
        expect(screen.queryByText('The correct answer is on the big screen')).toBeNull();
        expect(container.querySelector('.play-tone-danger')).not.toBeNull();
    });

    it('consolation line is in Russian too', () => {
        const { show } = setup({ lang: 'ru' });
        show(playerView({ phase: 'question_results', answered: true, myResult: { correct: false, points: 500 } }));
        expect(screen.getByText('Ближе всех — утешительные очки')).toBeInTheDocument();
        expect(screen.getByText('+500')).toBeInTheDocument();
    });

    it('time-out result is neutral, not danger', () => {
        const { show, container } = setup();
        show(playerView({ phase: 'question_results', answered: false, myResult: null }));
        expect(screen.getByRole('heading', { name: 'Time’s up' })).toBeInTheDocument();
        expect(screen.getByText('+0')).toBeInTheDocument();
        expect(screen.getByText(/no penalty/)).toBeInTheDocument();
        expect(container.querySelector('.play-tone-neutral')).not.toBeNull();
        expect(container.querySelector('.play-tone-danger')).toBeNull();

        // Answered, but the server has no result for the player: still neutral.
        show(playerView({ phase: 'question_results', answered: true, myResult: null }));
        expect(container.querySelector('.play-tone-neutral')).not.toBeNull();
    });

    it('rank screen shows the place among playerCount players and the score', () => {
        const { show } = setup();
        show(
            playerView({
                phase: 'leaderboard',
                playerCount: 14,
                me: { id: 'p1', nickname: 'Alice', score: 2120, rank: 4 },
            }),
        );
        expect(screen.getByText('Your place')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
        expect(screen.getByText('of 14 players')).toBeInTheDocument();
        expect(screen.getByText('2,120')).toBeInTheDocument();
    });

    it('final screen shows the medal place and highlights me on the podium', () => {
        const { show, container } = setup();
        show(
            playerView({
                phase: 'finished',
                outcome: 'completed',
                me: { id: 'p1', nickname: 'Alice', score: 9215, rank: 2 },
                podium: [
                    { playerId: 'p2', nickname: 'Bob', score: 9840, rank: 1 },
                    { playerId: 'p1', nickname: 'Alice', score: 9215, rank: 2 },
                    { playerId: 'p3', nickname: 'Anna', score: 8470, rank: 3 },
                ],
            }),
        );
        expect(screen.getByRole('heading', { name: 'Game over' })).toBeInTheDocument();
        expect(screen.getByText('Completed')).toBeInTheDocument();
        expect(container.querySelector('.play-place')).toHaveClass('play-medal-2');
        const podium = screen.getByRole('list', { name: 'Podium' });
        const rows = within(podium).getAllByRole('listitem');
        expect(rows.map((r) => r.classList.contains('is-me'))).toEqual([false, true, false]);
    });

    it('final screen «Enter a PIN» forgets the game and shows an empty pin screen', async () => {
        saveSession({ pin: '123456', gameId: 'g1', playerId: 'p1', playerToken: 'tok' });
        const { fake, user, show, where } = setup({ url: '/play?pin=123456' });
        fake.reply('player:rejoin', { ok: true, playerId: 'p1' });
        show(
            playerView({
                phase: 'finished',
                outcome: 'completed',
                me: { id: 'p1', nickname: 'Alice', score: 10, rank: 1 },
            }),
        );
        await flush();
        expect(screen.getByRole('heading', { name: 'Game over' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Enter a PIN' }));
        expect(loadSession()).toBeNull();
        expect(screen.getByLabelText('Game PIN')).toHaveValue('');
        expect(where()).toBe('/play');
    });

    it('kicked screen button clears session and shows pin screen', async () => {
        saveSession({ pin: '123456', gameId: 'g1', playerId: 'p1', playerToken: 'tok' });
        const { fake, user, show, where } = setup({ url: '/play?pin=123456' });
        fake.reply('player:rejoin', { ok: true, playerId: 'p1' });
        show(playerView());
        await flush();
        expect(screen.getByText('You’re in')).toBeInTheDocument();
        act(() => {
            fake.serverEmit('player:kicked');
        });
        expect(screen.getByRole('heading', { name: 'You were removed' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Enter a PIN' }));
        expect(loadSession()).toBeNull();
        expect(screen.getByRole('heading', { name: 'Join a game' })).toBeInTheDocument();
        expect(where()).toBe('/play');
    });

    it('closed screen thanks the player and offers a new PIN', async () => {
        const { fake, user, show } = setup();
        show(playerView());
        act(() => {
            fake.serverEmit('game:closed');
        });
        expect(screen.getByRole('heading', { name: 'Game closed' })).toBeInTheDocument();
        expect(screen.getByText(/Thanks for playing!/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Enter a PIN' }));
        expect(screen.getByLabelText('Game PIN')).toBeInTheDocument();
    });

    it('reconnecting overlay has role status', () => {
        const { fake, show } = setup();
        show(open());
        act(() => {
            fake.drop();
        });
        const status = screen.getByText('Reconnecting…').closest('[role="status"]');
        expect(status).not.toBeNull();
        expect(status).toHaveTextContent('Your seat and score are safe.');
        // Drawn over the current screen.
        expect(screen.getByRole('button', { name: 'Paris' })).toBeInTheDocument();
    });
});
