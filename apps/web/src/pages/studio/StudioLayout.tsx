import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { errorText } from '../../i18n/errors';
import { useI18n } from '../../i18n/i18n';
import { ApiError } from '../../api/client';
import { Button } from '../../ui/Button';
import { Logo } from '../../ui/Logo';
import { PrefsSwitch } from '../../ui/PrefsSwitch';
import { useToast } from '../../ui/Toast';

const navClass = (on: boolean) => (on ? 'nav-item on' : 'nav-item');

export function StudioLayout() {
    const { t } = useI18n();
    const { me, logout } = useAuth();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const notify = useToast();

    const signOut = () => {
        logout().then(
            () => {
                void navigate('/login', { replace: true });
            },
            (e: unknown) => {
                notify(errorText(t, e instanceof ApiError ? e.code : 'INTERNAL_ERROR'));
            },
        );
    };

    const quizzesOn = pathname === '/studio' || pathname.startsWith('/studio/quizzes');
    return (
        <div className="studio">
            <aside className="studio-side">
                <Logo />
                <nav className="studio-nav" aria-label={t.studio.navLabel}>
                    <NavLink to="/studio" className={navClass(quizzesOn)}>
                        {t.studio.navQuizzes}
                    </NavLink>
                    <NavLink to="/studio/packs" className={({ isActive }) => navClass(isActive)}>
                        {t.studio.navPacks}
                    </NavLink>
                    <NavLink to="/studio/history" className={({ isActive }) => navClass(isActive)}>
                        {t.studio.navHistory}
                    </NavLink>
                </nav>
                <div className="studio-account">
                    <PrefsSwitch />
                    <span className="studio-email muted">{me?.email}</span>
                    <Button variant="ghost" size="sm" onClick={signOut}>
                        {t.studio.signOut}
                    </Button>
                </div>
            </aside>
            <main className="studio-main">
                <Outlet />
            </main>
        </div>
    );
}
