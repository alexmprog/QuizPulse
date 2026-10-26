import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './theme';

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

describe('ThemeProvider', () => {
    it('theme defaults to prefers-color-scheme and setTheme persists', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.theme).toBe('dark');
        expect(document.documentElement).toHaveClass('qp', 'dark');

        act(() => {
            result.current.setTheme('light');
        });
        expect(document.documentElement).toHaveClass('qp');
        expect(document.documentElement).not.toHaveClass('dark');
        expect(localStorage.getItem('qp.theme')).toBe('light');
    });

    it('stored theme wins over the system preference', () => {
        localStorage.setItem('qp.theme', 'light');
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.theme).toBe('light');
        expect(document.documentElement).not.toHaveClass('dark');
    });
});
