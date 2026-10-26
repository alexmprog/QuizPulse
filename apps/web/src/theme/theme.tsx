import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'qp.theme';

function initialTheme(): Theme {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === 'light' || v === 'dark') return v;
    } catch {
        /* fall through to the system preference */
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface ThemeValue {
    theme: Theme;
    setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(initialTheme);

    useEffect(() => {
        const root = document.documentElement;
        root.classList.add('qp');
        root.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    const setTheme = useCallback((t: Theme) => {
        setThemeState(t);
        try {
            localStorage.setItem(STORAGE_KEY, t);
        } catch {
            /* storage unavailable: the choice lasts for this page view only */
        }
    }, []);

    const value = useMemo<ThemeValue>(() => ({ theme, setTheme }), [theme, setTheme]);
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
    return ctx;
}
