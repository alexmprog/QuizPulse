import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { I18nProvider, useI18n } from './i18n/i18n';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { HostPage } from './pages/host/HostPage';
import { PlayPage } from './pages/play/PlayPage';
import { HistoryDetailPage } from './pages/studio/HistoryDetailPage';
import { HistoryPage } from './pages/studio/HistoryPage';
import { EditorPage } from './pages/studio/editor/EditorPage';
import { PackViewPage } from './pages/studio/PackViewPage';
import { PacksPage } from './pages/studio/PacksPage';
import { QuizzesPage } from './pages/studio/QuizzesPage';
import { StudioLayout } from './pages/studio/StudioLayout';
import { ThemeProvider } from './theme/theme';
import { ToastProvider } from './ui/Toast';

function NotFound() {
    const { t } = useI18n();
    return (
        <main className="page">
            <h1 className="display">{t.notFound.title}</h1>
            <p className="muted">{t.notFound.text}</p>
            <Link className="link" to="/studio">
                {t.notFound.home}
            </Link>
        </main>
    );
}

export function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/studio" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
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
                <Route path="quizzes/:id" element={<EditorPage />} />
                <Route path="history" element={<HistoryPage />} />
                <Route path="history/:gameId" element={<HistoryDetailPage />} />
            </Route>
            <Route
                path="/host/:gameId"
                element={
                    <RequireAuth>
                        <HostPage />
                    </RequireAuth>
                }
            />
            <Route path="/play/*" element={<PlayPage />} />
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
}

export function App() {
    return (
        <ThemeProvider>
            <I18nProvider>
                <ToastProvider>
                    <BrowserRouter>
                        <AuthProvider>
                            <AppRoutes />
                        </AuthProvider>
                    </BrowserRouter>
                </ToastProvider>
            </I18nProvider>
        </ThemeProvider>
    );
}
