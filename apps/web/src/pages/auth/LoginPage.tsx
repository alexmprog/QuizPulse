import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { errorText } from '../../i18n/errors';
import { useI18n } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { AuthLayout, ErrorBanner } from './AuthLayout';
import { safeNext } from './next';

export function LoginPage() {
    const { t } = useI18n();
    const { me, login } = useAuth();
    const [params] = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // Also fires right after a successful login: `me` appears and the page moves on to `next`.
    if (me) return <Navigate to={safeNext(params.get('next'))} replace />;

    const submit = () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        login({ email: email.trim(), password }).catch((e: unknown) => {
            setError(errorText(t, e instanceof ApiError ? e.code : 'INTERNAL_ERROR'));
            setBusy(false);
        });
    };

    const next = params.get('next');
    const registerTo = next ? `/register?next=${encodeURIComponent(next)}` : '/register';
    return (
        <AuthLayout title={t.auth.loginTitle} onSubmit={submit}>
            {error && <ErrorBanner>{error}</ErrorBanner>}
            <Field
                label={t.auth.email}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                    setEmail(e.target.value);
                }}
            />
            <Field
                label={t.auth.password}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                    setPassword(e.target.value);
                }}
            />
            <Button type="submit" variant="primary" size="lg" block disabled={busy}>
                {t.auth.login}
            </Button>
            <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
                {t.auth.noAccount}{' '}
                <Link className="link" to={registerTo}>
                    {t.auth.toRegister}
                </Link>
            </p>
        </AuthLayout>
    );
}
