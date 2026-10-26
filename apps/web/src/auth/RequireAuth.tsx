import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useI18n } from '../i18n/i18n';
import { Spinner } from '../ui/Spinner';
import { useAuth } from './AuthProvider';

export function RequireAuth({ children }: { children: ReactNode }) {
    const { me, loading } = useAuth();
    const { pathname, search } = useLocation();
    const { t } = useI18n();
    if (loading) return <Spinner label={t.common.loading} />;
    if (!me) {
        const next = encodeURIComponent(pathname + search).replace(/%2F/g, '/');
        return <Navigate to={`/login?next=${next}`} replace />;
    }
    return <>{children}</>;
}
