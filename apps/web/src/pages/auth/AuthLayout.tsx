import type { SyntheticEvent, ReactNode } from 'react';
import { useI18n } from '../../i18n/i18n';
import { Logo } from '../../ui/Logo';
import { PrefsSwitch } from '../../ui/PrefsSwitch';

export function AuthLayout({
    title,
    onSubmit,
    children,
}: {
    title: string;
    onSubmit: () => void;
    children: ReactNode;
}) {
    const { t } = useI18n();
    const submit = (e: SyntheticEvent) => {
        e.preventDefault();
        onSubmit();
    };
    return (
        <main className="auth">
            <aside className="auth-brand">
                <Logo />
                <div className="auth-brand-body">
                    <div className="auth-slots" aria-hidden="true">
                        <span className="fill-a">
                            <span className="shape tri" />
                        </span>
                        <span className="fill-b">
                            <span className="shape dia" />
                        </span>
                        <span className="fill-c">
                            <span className="shape cir" />
                        </span>
                        <span className="fill-d">
                            <span className="shape sq" />
                        </span>
                    </div>
                    <h2 className="display" style={{ margin: 0, fontSize: 40 }}>
                        {t.auth.tagline}
                    </h2>
                    <p style={{ margin: 0, fontSize: 18, opacity: 0.9 }}>{t.auth.sub}</p>
                </div>
                <p style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>{t.auth.playerHint}</p>
            </aside>
            <div className="auth-main">
                <div className="auth-prefs">
                    <PrefsSwitch />
                </div>
                <div className="auth-center">
                    <form className="auth-form" onSubmit={submit} noValidate>
                        <h1 className="display" style={{ margin: '0 0 6px', fontSize: 28 }}>
                            {title}
                        </h1>
                        {children}
                    </form>
                </div>
            </div>
        </main>
    );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
    return (
        <div className="banner" role="alert">
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
            >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
            </svg>
            <span>{children}</span>
        </div>
    );
}
