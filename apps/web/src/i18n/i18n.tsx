import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { ru } from './ru';

export type Lang = 'ru' | 'en';
export type Dict = typeof ru;

const STORAGE_KEY = 'qp.lang';
const DICTS: Record<Lang, Dict> = { ru, en };

export function detectLang(navLang: string | undefined): Lang {
    return navLang?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

function readStored(): Lang | null {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v === 'ru' || v === 'en' ? v : null;
    } catch {
        return null;
    }
}

interface I18nValue {
    lang: Lang;
    setLang: (l: Lang) => void;
    t: Dict;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
    const [lang, setLangState] = useState<Lang>(() => initial ?? readStored() ?? detectLang(navigator.language));

    useEffect(() => {
        document.documentElement.lang = lang;
    }, [lang]);

    const setLang = useCallback((l: Lang) => {
        setLangState(l);
        try {
            localStorage.setItem(STORAGE_KEY, l);
        } catch {
            /* storage unavailable: the choice lasts for this page view only */
        }
    }, []);

    const value = useMemo<I18nValue>(() => ({ lang, setLang, t: DICTS[lang] }), [lang, setLang]);
    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
    return ctx;
}
