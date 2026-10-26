import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import { onUnauthenticated, type Schemas } from '../api/client';

type Me = Schemas['Me'];
type Credentials = Schemas['Credentials'];

interface AuthValue {
    me: Me | null;
    loading: boolean;
    login: (c: Credentials) => Promise<Me>;
    register: (c: Credentials) => Promise<Me>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        authApi
            .me()
            .then((m) => {
                if (alive) setMe(m);
            })
            .catch(() => {
                /* 401 or unreachable server: treated as signed out */
            })
            .finally(() => {
                if (alive) setLoading(false);
            });
        const off = onUnauthenticated(() => {
            setMe(null);
        });
        return () => {
            alive = false;
            off();
        };
    }, []);

    const login = useCallback(async (c: Credentials) => {
        const m = await authApi.login(c);
        setMe(m);
        return m;
    }, []);
    const register = useCallback(async (c: Credentials) => {
        const m = await authApi.register(c);
        setMe(m);
        return m;
    }, []);
    const logout = useCallback(async () => {
        await authApi.logout();
        setMe(null);
    }, []);

    const value = useMemo(() => ({ me, loading, login, register, logout }), [me, loading, login, register, logout]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}
