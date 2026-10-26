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

const PASSWORD_MIN = 8;

export function RegisterPage() {
    const { t } = useI18n();
    const { me, register } = useAuth();
    const [params] = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [banner, setBanner] = useState<string | null>(null);
    const [emailTaken, setEmailTaken] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (me) return <Navigate to={safeNext(params.get('next'))} replace />;

    const submit = () => {
        if (busy) return;
        setBanner(null);
        setEmailTaken(false);
        if (password.length < PASSWORD_MIN) {
            setPasswordError(t.auth.passwordHint);
            return;
        }
        setPasswordError(null);
        setBusy(true);
        register({ email: email.trim(), password }).catch((e: unknown) => {
            const code = e instanceof ApiError ? e.code : 'INTERNAL_ERROR';
            if (code === 'EMAIL_TAKEN') {
                setEmailTaken(true);
                setBanner(t.auth.emailTaken);
            } else {
                setBanner(errorText(t, code));
            }
            setBusy(false);
        });
    };

    const next = params.get('next');
    const loginTo = next ? `/login?next=${encodeURIComponent(next)}` : '/login';
    return (
        <AuthLayout title={t.auth.registerTitle} onSubmit={submit}>
            {banner && <ErrorBanner>{banner}</ErrorBanner>}
            <Field
                label={t.auth.email}
                type="email"
                autoComplete="email"
                value={email}
                className={emailTaken ? 'invalid' : undefined}
                aria-invalid={emailTaken ? true : undefined}
                onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailTaken(false);
                }}
            />
            <Field
                label={t.auth.password}
                type="password"
                autoComplete="new-password"
                value={password}
                hint={t.auth.passwordHint}
                error={passwordError ?? undefined}
                onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(null);
                }}
            />
            <Button type="submit" variant="primary" size="lg" block disabled={busy}>
                {t.auth.register}
            </Button>
            <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
                {t.auth.haveAccount}{' '}
                <Link className="link" to={loginTo}>
                    {t.auth.toLogin}
                </Link>
            </p>
        </AuthLayout>
    );
}
