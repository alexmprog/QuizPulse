import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUESTIONS_MAX } from '@quizpulse/protocol';
import { AppRoutes } from '../../../App';
import { setCsrfToken } from '../../../api/client';
import { AuthProvider } from '../../../auth/AuthProvider';
import { en } from '../../../i18n/en';
import { I18nProvider } from '../../../i18n/i18n';
import { ThemeProvider } from '../../../theme/theme';
import { ToastProvider } from '../../../ui/Toast';
import { EditorPage } from './EditorPage';
import { QUIZ } from './fixtures';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const ME = { id: '11111111-1111-4111-8111-111111111111', email: 'host@example.com' };

function respond(quiz = QUIZ) {
    fetchMock.mockImplementation((url, init) => {
        const key = `${init?.method ?? 'GET'} ${url}`;
        let body: unknown = { code: 'INTERNAL_ERROR' };
        let status = 500;
        if (key === 'GET /api/v1/auth/me') [body, status] = [ME, 200];
        else if (key === 'GET /api/v1/auth/csrf') [body, status] = [{ token: 't' }, 200];
        else if (key === `GET /api/v1/quizzes/${quiz.id}`) [body, status] = [quiz, 200];
        else if (key === `PUT /api/v1/quizzes/${quiz.id}`) [body, status] = [quiz, 200];
        return Promise.resolve(new Response(JSON.stringify(body), { status }));
    });
}

function renderEditor() {
    return render(
        <ThemeProvider>
            <I18nProvider initial="en">
                <ToastProvider>
                    <MemoryRouter initialEntries={[`/studio/quizzes/${QUIZ.id}`]}>
                        <AuthProvider>
                            <Routes>
                                <Route path="/studio/quizzes/:id" element={<EditorPage />} />
                                <Route path="/studio" element={<div>quizzes list</div>} />
                            </Routes>
                        </AuthProvider>
                    </MemoryRouter>
                </ToastProvider>
            </I18nProvider>
        </ThemeProvider>,
    );
}

describe('quiz editor', () => {
    beforeEach(() => {
        setCsrfToken(null);
        vi.stubGlobal('fetch', fetchMock);
        respond();
    });
    afterEach(() => {
        fetchMock.mockReset();
    });

    it('shows the questions, the editor of the first one and the settings', async () => {
        renderEditor();
        expect(await screen.findByDisplayValue('Pub quiz')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Capital of France?')).toBeInTheDocument();
        expect(screen.getByText(en.editor.settingsTitle)).toBeInTheDocument();
        expect(screen.getByText(en.editor.saved)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: en.studio.startGame })).toBeEnabled();
    });

    it('editor shows error count and disables start game', async () => {
        const user = userEvent.setup();
        renderEditor();
        const text = await screen.findByDisplayValue('Capital of France?');
        await user.clear(text);
        expect(screen.getByText(en.editor.errorsCount(1))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: en.studio.startGame })).toBeDisabled();
        const list = screen.getByRole('list', { name: en.editor.questionsList });
        expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    });

    it('saves an edit with a PUT after the debounce', async () => {
        const user = userEvent.setup();
        renderEditor();
        const title = await screen.findByDisplayValue('Pub quiz');
        await user.type(title, '!');
        await waitFor(
            () => {
                expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true);
            },
            { timeout: 3000 },
        );
        const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
        expect(JSON.parse(String(put?.[1]?.body as string | undefined))).toMatchObject({ title: 'Pub quiz!' });
        expect(await screen.findByText(en.editor.saved)).toBeInTheDocument();
    });

    it('adds a question from the menu and cannot delete the last one', async () => {
        const user = userEvent.setup();
        renderEditor();
        await screen.findByDisplayValue('Pub quiz');
        await user.click(screen.getByRole('button', { name: en.editor.addQuestion }));
        await user.click(screen.getByRole('menuitem', { name: en.studio.typeNumeric }));
        const list = screen.getByRole('list', { name: en.editor.questionsList });
        expect(within(list).getAllByRole('listitem')).toHaveLength(4);
        expect(screen.getByLabelText(en.editor.numericAnswer)).toBeInTheDocument();
    });

    it('removing an option before the correct one keeps the right answer marked', async () => {
        const user = userEvent.setup();
        renderEditor();
        await screen.findByDisplayValue('Pub quiz');
        await user.click(screen.getByRole('radio', { name: en.editor.markCorrect(3) }));
        await user.click(screen.getByRole('button', { name: en.editor.removeOption(1) }));
        expect(screen.getByRole('radio', { name: en.editor.markCorrect(2) })).toBeChecked();
    });

    it('switching to manual restores a valid hidden auto-advance value', async () => {
        const user = userEvent.setup();
        renderEditor();
        await screen.findByDisplayValue('Pub quiz');
        await user.click(screen.getByRole('button', { name: en.editor.advanceAuto }));
        await user.clear(screen.getByLabelText(en.editor.autoAfter));
        expect(screen.getByText(en.editor.errorsCount(1))).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: en.editor.advanceManual }));
        expect(screen.queryByText(en.editor.errorsCount(1))).not.toBeInTheDocument();
    });

    it('the last question cannot be deleted', async () => {
        const one = { ...QUIZ, questions: QUIZ.questions.slice(0, 1) };
        respond(one);
        renderEditor();
        await screen.findByDisplayValue('Pub quiz');
        expect(screen.getByRole('button', { name: en.editor.deleteQuestion })).toBeDisabled();
    });

    it('adding is disabled at the question limit', async () => {
        const first = QUIZ.questions[0];
        if (!first) throw new Error('fixture');
        const many = {
            ...QUIZ,
            questions: Array.from({ length: QUESTIONS_MAX }, (_, i) => ({
                ...first,
                id: `q-${String(i)}`,
                position: i,
            })),
        };
        respond(many);
        renderEditor();
        await screen.findByDisplayValue('Pub quiz');
        expect(screen.getByRole('button', { name: en.editor.addQuestion })).toBeDisabled();
    });

    it('the true/false tiles set correctOption 0 and 1', async () => {
        const user = userEvent.setup();
        renderEditor();
        await screen.findByDisplayValue('Pub quiz');
        const list = screen.getByRole('list', { name: en.editor.questionsList });
        await user.click(within(list).getByText('The sun is a star'));
        const yes = screen.getByRole('radio', { name: en.studio.optionTrue });
        const no = screen.getByRole('radio', { name: en.studio.optionFalse });
        expect(yes).toBeChecked();
        await user.click(no);
        expect(no).toBeChecked();
        await waitFor(
            () => {
                expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true);
            },
            { timeout: 3000 },
        );
        const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
        const body = JSON.parse(String(put?.[1]?.body as string | undefined)) as {
            questions: { correctOption: number }[];
        };
        expect(body.questions[1]?.correctOption).toBe(1);
        await user.click(yes);
        expect(yes).toBeChecked();
    });
});

describe('editor and an expired session', () => {
    beforeEach(() => {
        setCsrfToken(null);
        sessionStorage.clear();
    });
    afterEach(() => {
        fetchMock.mockReset();
        sessionStorage.clear();
    });

    function Where() {
        const l = useLocation();
        return <output data-testid="where">{l.pathname + l.search}</output>;
    }

    it('a 401 autosave keeps the edit through the login and saves it afterwards', async () => {
        let signedIn = true;
        const puts: unknown[] = [];
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockImplementation((url, init) => {
            const key = `${init?.method ?? 'GET'} ${url}`;
            let body: unknown = { code: 'INTERNAL_ERROR' };
            let status = 500;
            const headers: Record<string, string> = {};
            if (key === 'GET /api/v1/auth/me')
                [body, status] = signedIn ? [ME, 200] : [{ code: 'UNAUTHENTICATED' }, 401];
            else if (key === 'GET /api/v1/auth/csrf') [body, status] = [{ token: 't' }, 200];
            else if (key === 'POST /api/v1/auth/login') {
                signedIn = true;
                [body, status] = [ME, 200];
                headers['X-CSRF-Token'] = 't2';
            } else if (key === `GET /api/v1/quizzes/${QUIZ.id}`) [body, status] = [QUIZ, 200];
            else if (key === `PUT /api/v1/quizzes/${QUIZ.id}`) {
                if (signedIn) {
                    puts.push(JSON.parse(String(init?.body as string | undefined)));
                    [body, status] = [QUIZ, 200];
                } else [body, status] = [{ code: 'UNAUTHENTICATED' }, 401];
            }
            return Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
        });
        const user = userEvent.setup();
        render(
            <ThemeProvider>
                <I18nProvider initial="en">
                    <ToastProvider>
                        <MemoryRouter initialEntries={[`/studio/quizzes/${QUIZ.id}`]}>
                            <AuthProvider>
                                <AppRoutes />
                                <Where />
                            </AuthProvider>
                        </MemoryRouter>
                    </ToastProvider>
                </I18nProvider>
            </ThemeProvider>,
        );
        const title = await screen.findByDisplayValue('Pub quiz');
        // The session expires on the server.
        signedIn = false;
        await user.type(title, '!');

        // The 401 sends the host to the login page.
        expect(await screen.findByRole('button', { name: en.auth.login }, { timeout: 3000 })).toBeInTheDocument();
        expect(screen.getByTestId('where')).toHaveTextContent(`/login?next=/studio/quizzes/${QUIZ.id}`);
        expect(puts).toEqual([]);

        await user.type(screen.getByLabelText(en.auth.email), 'host@example.com');
        await user.type(screen.getByLabelText(en.auth.password), 'password1');
        await user.click(screen.getByRole('button', { name: en.auth.login }));

        // Back in the editor with the edit, which now gets saved.
        expect(await screen.findByDisplayValue('Pub quiz!')).toBeInTheDocument();
        await waitFor(
            () => {
                expect(puts).toHaveLength(1);
            },
            { timeout: 3000 },
        );
        expect(puts[0]).toMatchObject({ title: 'Pub quiz!' });
        expect(await screen.findByText(en.editor.saved)).toBeInTheDocument();
        expect(sessionStorage.getItem(`qp.draft.${QUIZ.id}`)).toBeNull();
    });
});
