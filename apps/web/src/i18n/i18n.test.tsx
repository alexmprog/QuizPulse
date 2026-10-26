import { act, render, renderHook } from '@testing-library/react';
import { ERROR_CODES } from '@quizpulse/protocol';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { errorText } from './errors';
import { I18nProvider, detectLang, useI18n } from './i18n';
import { ru } from './ru';
import { formatDate, formatNumber } from './format';

describe('detectLang', () => {
    it('maps navigator language to ru or en', () => {
        expect(detectLang('ru-RU')).toBe('ru');
        expect(detectLang('en-US')).toBe('en');
        expect(detectLang(undefined)).toBe('en');
    });
});

describe('errorText', () => {
    it('every ErrorCode has text in ru and en', () => {
        for (const code of ERROR_CODES) {
            const r = errorText(ru, code);
            const e = errorText(en, code);
            expect(r).not.toBe('');
            expect(e).not.toBe('');
            expect(r).not.toBe(e);
        }
    });
});

describe('I18nProvider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>;

    it('language choice persists', () => {
        const { result } = renderHook(() => useI18n(), { wrapper });
        act(() => {
            result.current.setLang('en');
        });
        expect(localStorage.getItem('qp.lang')).toBe('en');
        expect(document.documentElement.lang).toBe('en');
        expect(result.current.t).toBe(en);
    });

    it('restores the stored language over navigator.language', () => {
        localStorage.setItem('qp.lang', 'ru');
        const { result } = renderHook(() => useI18n(), { wrapper });
        expect(result.current.lang).toBe('ru');
        expect(document.documentElement.lang).toBe('ru');
    });

    it('renders children', () => {
        const { getByText } = render(
            <I18nProvider initial="ru">
                <span>ok</span>
            </I18nProvider>,
        );
        expect(getByText('ok')).toBeInTheDocument();
    });
});

describe('format', () => {
    it('formats dates and numbers per language', () => {
        const iso = '2026-10-21T12:00:00Z';
        expect(formatDate('en', iso)).toBe('Oct 21');
        expect(formatDate('ru', iso)).toMatch(/^21 окт/);
        expect(formatNumber('en', 2680)).toBe('2,680');
        expect(formatNumber('ru', 2680).replace(/\s/g, ' ')).toBe('2 680');
    });
});
