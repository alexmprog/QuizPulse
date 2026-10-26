import { expect, test, type Page } from '@playwright/test';
import {
    closePlayers,
    copyPack,
    EN_PACK,
    en,
    joinGame,
    openPlayer,
    readLobby,
    registerHost,
    ru,
    shot,
    type Dict,
} from './support';

type Lang = 'ru' | 'en';
type Theme = 'light' | 'dark';

const COMBOS: readonly { lang: Lang; theme: Theme }[] = [
    { lang: 'ru', theme: 'light' },
    { lang: 'ru', theme: 'dark' },
    { lang: 'en', theme: 'light' },
    { lang: 'en', theme: 'dark' },
];
const DICTS: Record<Lang, Dict> = { ru, en };

/** The first question of the EN pack «General knowledge» and its right option. */
const Q1 = { text: 'What is the capital of Australia?', right: 'Canberra' };

test.afterEach(closePlayers);

/** Picks language and theme with the page's own switches (whatever language the page is in now). */
async function setPrefs(page: Page, lang: Lang, theme: Theme): Promise<Dict> {
    const languageGroup = page.getByRole('group', {
        name: new RegExp(`^(${ru.prefs.language}|${en.prefs.language})$`),
    });
    await languageGroup.getByRole('button', { name: lang.toUpperCase(), exact: true }).click();
    const t = DICTS[lang];
    await page
        .getByRole('group', { name: t.prefs.theme, exact: true })
        .getByRole('button', { name: theme === 'light' ? t.prefs.light : t.prefs.dark, exact: true })
        .click();
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    return t;
}

/** An English screen has no Russian interface strings (the quiz content is the English pack, so no Cyrillic at all). */
async function expectNoRussian(page: Page, lang: Lang): Promise<void> {
    if (lang !== 'en') return;
    await expect(page.getByText(ru.studio.startGame)).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(/[А-Яа-яЁё]/);
}

async function capture(page: Page, name: string, lang: Lang, theme: Theme): Promise<void> {
    await expectNoRussian(page, lang);
    await shot(page, `${name}-${lang}-${theme}`);
}

test('screenshots in RU/EN and light/dark', async ({ page: host, browser }) => {
    await host.goto('/login');
    for (const { lang, theme } of COMBOS) {
        const t = await setPrefs(host, lang, theme);
        await expect(host.getByRole('heading', { name: t.auth.loginTitle })).toBeVisible();
        await capture(host, 'login', lang, theme);
    }

    await setPrefs(host, 'ru', 'light');
    await registerHost(host);
    await copyPack(host, EN_PACK);
    await host.goto('/studio');
    for (const { lang, theme } of COMBOS) {
        const t = await setPrefs(host, lang, theme);
        await expect(host.getByRole('heading', { name: t.studio.quizzesTitle })).toBeVisible();
        await expect(host.getByRole('heading', { name: EN_PACK })).toBeVisible();
        await capture(host, 'studio', lang, theme);
    }

    // The game screens have no switches once the game runs: each combination gets its own game, set in the lobby.
    let current: Dict = en;
    for (const { lang, theme } of COMBOS) {
        await expect(host.getByRole('heading', { name: current.studio.quizzesTitle })).toBeVisible();
        await host.getByRole('button', { name: current.studio.startGame }).click();
        const { pin } = await readLobby(host);
        const t = await setPrefs(host, lang, theme);
        current = t;

        const player = await openPlayer(browser, 'Pixel 7');
        await setPrefs(player, lang, theme);
        await joinGame(player, pin, 'Alice', t);
        await expect(host.getByText('Alice', { exact: true })).toBeVisible();
        await capture(host, 'host-lobby', lang, theme);
        await capture(player, 'player-lobby', lang, theme);

        await host.getByRole('button', { name: t.host.start }).click();
        await expect(host.getByRole('heading', { name: Q1.text })).toBeVisible();
        await expect(player.getByRole('button', { name: Q1.right, exact: true })).toBeEnabled();
        await capture(host, 'host-question', lang, theme);
        await capture(player, 'player-question', lang, theme);

        await player.getByRole('button', { name: Q1.right, exact: true }).click();
        await expect(player.getByRole('heading', { name: t.play.correct })).toBeVisible();
        await capture(player, 'player-result', lang, theme);

        await host.getByRole('button', { name: t.host.endEarly }).click();
        await host
            .getByRole('dialog', { name: t.host.endTitle })
            .getByRole('button', { name: t.host.endConfirm, exact: true })
            .click();
        await expect(host.getByText(t.host.aborted, { exact: true })).toBeVisible();
        await host.getByRole('button', { name: t.host.toStudio }).click();
        await closePlayers();
    }
});
