import type { Lang } from './i18n';

const LOCALES: Record<Lang, string> = { ru: 'ru-RU', en: 'en-US' };

/** «21 окт.» / «Oct 21» */
export function formatDate(lang: Lang, iso: string): string {
    return new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(iso),
    );
}

/** «2 680» / «2,680» */
export function formatNumber(lang: Lang, n: number): string {
    return new Intl.NumberFormat(LOCALES[lang]).format(n);
}

/** «2,6» / «2.6»: megabytes (1 MB = 1024 KiB) with one decimal. */
export function formatMegabytes(lang: Lang, bytes: number): string {
    return new Intl.NumberFormat(LOCALES[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
        bytes / (1024 * 1024),
    );
}
