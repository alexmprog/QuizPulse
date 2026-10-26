import { expect, test, webkit, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { HostView } from '@quizpulse/protocol';
import { randomBytes } from 'node:crypto';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';

export { en, ru };
export type Dict = typeof ru;

/** Built-in packs are picked by title: their order changes between restarts. Titles from `apps/api/seed/packs`. */
export const RU_PACK = 'Всё обо всём';
export const EN_PACK = 'General knowledge';

/** The test hosts' password: generated per run, used only for accounts this run registers on the test stack. */
const PASSWORD = `e2e-${randomBytes(12).toString('base64url')}`;

export type PlayerDevice = 'iPhone 13' | 'Pixel 7';

export function uniqueEmail(): string {
    return `e2e+${String(Date.now())}-${randomBytes(4).toString('hex')}@example.test`;
}

/** Signs a new host up through `/register`; the app lands in the studio, signed in. */
export async function registerHost(page: Page): Promise<{ email: string }> {
    const email = uniqueEmail();
    await page.goto('/register');
    await page.getByLabel(ru.auth.email).fill(email);
    await page.getByLabel(ru.auth.password).fill(PASSWORD);
    await page.getByRole('button', { name: ru.auth.register }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole('heading', { name: ru.studio.quizzesTitle })).toBeVisible();
    return { email };
}

/** Copies a built-in pack (by title) into «My quizzes» and opens the copy in the editor. RU interface. */
export async function copyPack(page: Page, packTitle: string = RU_PACK): Promise<void> {
    await page.goto('/studio/packs');
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: packTitle, exact: true }) });
    await card.getByRole('button', { name: ru.studio.copyPack }).click();
    await page.getByRole('button', { name: ru.studio.open, exact: true }).click();
    await expect(page).toHaveURL(/\/studio\/quizzes\/[^/]+$/);
    await expect(page.getByLabel(ru.editor.titleLabel)).toHaveValue(packTitle);
}

/** Reads the PIN and game id off the host lobby. */
export async function readLobby(page: Page): Promise<{ pin: string; gameId: string }> {
    await expect(page).toHaveURL(/\/host\/[^/]+$/);
    const pinText = await page.getByText(/^\d{3} \d{3}$/).textContent();
    const pin = (pinText ?? '').replace(/\D/g, '');
    expect(pin).toMatch(/^\d{6}$/);
    const gameId = new URL(page.url()).pathname.split('/').pop() ?? '';
    return { pin, gameId };
}

/**
 * Copies a pack, lets `configure` change the copy in the editor (settings, questions), waits for the autosave and
 * starts a game from the editor. Returns the lobby's PIN and the game id.
 */
export async function copyPackAndStart(
    page: Page,
    packTitle: string = RU_PACK,
    configure?: (page: Page) => Promise<void>,
): Promise<{ pin: string; gameId: string }> {
    await copyPack(page, packTitle);
    if (configure) await configure(page);
    const start = page.getByRole('button', { name: ru.studio.startGame });
    await expect(page.getByRole('status').getByText(ru.editor.saved)).toBeVisible();
    await expect(start).toBeEnabled();
    await start.click();
    return readLobby(page);
}

const playerContexts: BrowserContext[] = [];
const extraBrowsers: Browser[] = [];

function baseURL(): string {
    const url = test.info().project.use.baseURL;
    if (!url) throw new Error('baseURL is not configured');
    return url;
}

/**
 * A phone on `/play`, not joined yet. `Pixel 7` runs in the test's Chromium; `iPhone 13` launches WebKit, as the
 * descriptor wants. Closed by `closePlayers()`.
 */
export async function openPlayer(browser: Browser, device: PlayerDevice): Promise<Page> {
    let owner = browser;
    if (device === 'iPhone 13') {
        owner = await webkit.launch();
        extraBrowsers.push(owner);
    }
    const context = await owner.newContext({ ...devices[device], locale: 'ru-RU', baseURL: baseURL() });
    playerContexts.push(context);
    const page = await context.newPage();
    await page.goto('/play');
    await expect(page.getByLabel(ru.play.pin)).toBeVisible();
    return page;
}

/** Enters the PIN and the nickname on a phone at the PIN screen and waits for the lobby, in the language of `t`. */
export async function joinGame(page: Page, pin: string, nickname: string, t: Dict = ru): Promise<void> {
    await page.getByLabel(t.play.pin).fill(pin);
    await page.getByRole('button', { name: t.play.next }).click();
    await page.getByLabel(t.play.nick).fill(nickname);
    await page.getByRole('button', { name: t.play.enter }).click();
    await expect(page.getByText(t.play.inGame)).toBeVisible();
}

export async function newPlayer(browser: Browser, device: PlayerDevice, pin: string, nickname: string): Promise<Page> {
    const page = await openPlayer(browser, device);
    await joinGame(page, pin, nickname);
    return page;
}

/** Closes every phone opened by `openPlayer` (call from `afterEach`). */
export async function closePlayers(): Promise<void> {
    for (const context of playerContexts.splice(0)) await context.close();
    for (const browser of extraBrowsers.splice(0)) await browser.close();
}

/** Attaches a screenshot to the test's report (no visual diff). */
export async function shot(page: Page, name: string): Promise<void> {
    await test.info().attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

/**
 * Records the `host:state` snapshots the host page receives over its Socket.IO WebSocket. Call before the page
 * opens the host screen; `latest()` is the newest snapshot, `all()` every one so far.
 */
export function trackHostState(page: Page): { latest: () => HostView | null; all: () => readonly HostView[] } {
    const states: HostView[] = [];
    const prefix = '42/game,';
    page.on('websocket', (ws) => {
        ws.on('framereceived', ({ payload }) => {
            if (typeof payload !== 'string' || !payload.startsWith(prefix)) return;
            const message: unknown = JSON.parse(payload.slice(prefix.length));
            if (Array.isArray(message) && message[0] === 'host:state') states.push(message[1] as HostView);
        });
    });
    return { latest: () => states.at(-1) ?? null, all: () => states };
}

/** «Осталось 12 с» → 12, from the `timer` role's accessible name. */
export async function secondsLeft(page: Page): Promise<number> {
    const label = (await page.getByRole('timer').getAttribute('aria-label')) ?? '';
    const n = Number(/\d+/.exec(label)?.[0]);
    expect(Number.isInteger(n), `timer label «${label}»`).toBe(true);
    return n;
}
