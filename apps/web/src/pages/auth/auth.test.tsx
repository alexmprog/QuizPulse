import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from '../../api/client';
import { AuthProvider } from '../../auth/AuthProvider';
import { RequireAuth } from '../../auth/RequireAuth';
import { I18nProvider } from '../../i18n/i18n';
import { en } from '../../i18n/en';
import { ThemeProvider } from '../../theme/theme';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
const ME = { id: '11111111-1111-4111-8111-111111111111', email: 'host@example.com' };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function respond(routes: Record<string, Reply>) {
    fetchMock.mockImplementation((url) => {
        const r = routes[url] ?? { status: 500, body: { code: 'INTERNAL_ERROR' } };
        return Promise.resolve(
            new Response(r.body === undefined ? null : JSON.stringify(r.body), {
                status: r.status ?? 200,
                headers: r.headers,
            }),
        );
    });
}

const unauth: Reply = { status: 401, body: { code: 'UNAUTHENTICATED' } };
const csrf: Reply = { body: { token: 't' } };

function Where() {
    const { pathname, search } = useLocation();
    return <div data-testid="where">{pathname + search}</div>;
}

function renderAt(path: string) {
    return render(
        <ThemeProvider>
            <I18nProvider initial="en">
                <MemoryRouter initialEntries={[path]}>
                    <AuthProvider>
                        <Routes>
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/register" element={<RegisterPage />} />
                            <Route
                                path="/studio/*"
                                element={
                                    <RequireAuth>
                                        <div>studio home</div>
                                    </RequireAuth>
                                }
                            />
                        </Routes>
                        <Where />
                    </AuthProvider>
                </MemoryRouter>
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

describe('login page', () => {
    it('shows INVALID_CREDENTIALS banner', async () => {
        respond({
            '/api/v1/auth/me': unauth,
            '/api/v1/auth/csrf': csrf,
            '/api/v1/auth/login': { status: 401, body: { code: 'INVALID_CREDENTIALS' } },
        });
        renderAt('/login');
        const user = userEvent.setup();
        await user.type(await screen.findByLabelText(en.auth.email), 'host@example.com');
        await user.type(screen.getByLabelText(en.auth.password), 'wrong-pass');
        await user.click(screen.getByRole('button', { name: en.auth.login }));
        expect(await screen.findByRole('alert')).toHaveTextContent(en.errors.INVALID_CREDENTIALS);
        expect(screen.getByRole('button', { name: en.auth.login })).toBeEnabled();
    });

    it('goes to a safe next after login and ignores external next', async () => {
        respond({
            '/api/v1/auth/me': unauth,
            '/api/v1/auth/csrf': csrf,
            '/api/v1/auth/login': { body: ME, headers: { 'X-CSRF-Token': 'rot' } },
        });
        renderAt('/login?next=/studio/history');
        const user = userEvent.setup();
        await user.type(await screen.findByLabelText(en.auth.email), 'host@example.com');
        await user.type(screen.getByLabelText(en.auth.password), 'password1');
        await user.click(screen.getByRole('button', { name: en.auth.login }));
        expect(await screen.findByText('studio home')).toBeInTheDocument();
        expect(screen.getByTestId('where')).toHaveTextContent('/studio/history');
    });

    it('falls back to /studio for //evil next', async () => {
        respond({ '/api/v1/auth/me': { body: ME } });
        renderAt('/login?next=//evil.example');
        expect(await screen.findByText('studio home')).toBeInTheDocument();
        expect(screen.getByTestId('where')).toHaveTextContent(/^\/studio$/);
    });

    it('a signed-in visitor of /login lands on /studio', async () => {
        respond({ '/api/v1/auth/me': { body: ME } });
        renderAt('/login');
        expect(await screen.findByText('studio home')).toBeInTheDocument();
    });
});

describe('register page', () => {
    it('shows EMAIL_TAKEN on email field', async () => {
        respond({
            '/api/v1/auth/me': unauth,
            '/api/v1/auth/csrf': csrf,
            '/api/v1/auth/register': { status: 409, body: { code: 'EMAIL_TAKEN' } },
        });
        renderAt('/register');
        const user = userEvent.setup();
        await user.type(await screen.findByLabelText(en.auth.email), 'host@example.com');
        await user.type(screen.getByLabelText(en.auth.password), 'password1');
        await user.click(screen.getByRole('button', { name: en.auth.register }));
        expect(await screen.findByRole('alert')).toHaveTextContent(en.auth.emailTaken);
        expect(screen.getByLabelText(en.auth.email)).toHaveAttribute('aria-invalid', 'true');
    });

    it('blocks 7-char password without request', async () => {
        respond({ '/api/v1/auth/me': unauth });
        renderAt('/register');
        const user = userEvent.setup();
        await user.type(await screen.findByLabelText(en.auth.email), 'host@example.com');
        await user.type(screen.getByLabelText(en.auth.password), '1234567');
        await user.click(screen.getByRole('button', { name: en.auth.register }));
        expect(await screen.findByRole('alert')).toHaveTextContent(en.auth.passwordHint);
        expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/v1/auth/me']);
    });
});

describe('RequireAuth', () => {
    it('redirects to /login?next=/studio/history', async () => {
        respond({ '/api/v1/auth/me': unauth });
        renderAt('/studio/history');
        await waitFor(() => {
            expect(screen.getByTestId('where')).toHaveTextContent('/login?next=/studio/history');
        });
        expect(screen.queryByText('studio home')).not.toBeInTheDocument();
    });
});
