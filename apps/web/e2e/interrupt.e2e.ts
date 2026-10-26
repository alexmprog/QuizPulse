import { expect, test, type Page } from '@playwright/test';
import type { HostView } from '@quizpulse/protocol';
import {
    closePlayers,
    copyPackAndStart,
    newPlayer,
    registerHost,
    ru,
    RU_PACK,
    secondsLeft,
    shot,
    trackHostState,
} from './support';

/** The first question of the RU pack «Всё обо всём» (20 s, the pack default) and its options. */
const Q1 = { text: 'Какой город является столицей Канады?', options: ['Оттава', 'Торонто', 'Монреаль', 'Ванкувер'] };

test.afterEach(closePlayers);

async function expectQuestionOpen(host: Page, players: Page[]): Promise<void> {
    await expect(host.getByRole('heading', { name: Q1.text })).toBeVisible();
    for (const p of players) await expect(p.getByRole('button', { name: Q1.options[0], exact: true })).toBeEnabled();
}

test('pause hides question everywhere', async ({ page: host, browser }) => {
    await registerHost(host);
    const { pin } = await copyPackAndStart(host, RU_PACK);
    const players = [
        await newPlayer(browser, 'iPhone 13', pin, 'Alice'),
        await newPlayer(browser, 'Pixel 7', pin, 'Bob'),
    ];
    await host.getByRole('button', { name: ru.host.start }).click();
    await expectQuestionOpen(host, players);

    const before = await secondsLeft(host);
    await host.getByRole('button', { name: ru.host.pause }).click();

    // Neither the big screen nor the phones show the question or its options while paused.
    await expect(host.getByRole('heading', { name: ru.host.paused })).toBeVisible();
    await expect(host.getByText(Q1.text)).toHaveCount(0);
    for (const option of Q1.options) await expect(host.getByText(option, { exact: true })).toHaveCount(0);
    for (const p of players) {
        await expect(p.getByRole('heading', { name: ru.play.paused })).toBeVisible();
        await expect(p.getByRole('button')).toHaveCount(0);
        for (const option of Q1.options) await expect(p.getByText(option, { exact: true })).toHaveCount(0);
    }
    const pausedLeft = new RegExp(`^${ru.host.pausedLeft(0).replace('0', '\\d+')}$`);
    const leftText = (await host.getByText(pausedLeft).textContent()) ?? '';
    const paused = Number(/\d+/.exec(leftText)?.[0]);
    expect(paused).toBeLessThanOrEqual(before);
    await shot(host, 'host-paused');
    await shot(players[0] ?? host, 'player-paused');

    // Hold the pause for a while: a timer that kept running would lose these seconds.
    await host.waitForTimeout(2500);
    await host.getByRole('button', { name: ru.host.resume }).click();
    await expectQuestionOpen(host, players);

    const after = await secondsLeft(host);
    expect(after).toBeLessThanOrEqual(paused);
    expect(after).toBeGreaterThanOrEqual(paused - 1);
    for (const p of players) expect(await secondsLeft(p)).toBeLessThanOrEqual(before);
});

test('player reload keeps seat', async ({ page: host, browser }) => {
    const hostState = trackHostState(host);
    await registerHost(host);
    const { pin } = await copyPackAndStart(host, RU_PACK);
    const alice = await newPlayer(browser, 'iPhone 13', pin, 'Alice');
    // Bob stays silent, so the question stays open after Alice's answer.
    const bob = await newPlayer(browser, 'Pixel 7', pin, 'Bob');
    await host.getByRole('button', { name: ru.host.start }).click();
    await expectQuestionOpen(host, [alice, bob]);

    await alice.getByRole('button', { name: Q1.options[0], exact: true }).click();
    await expect(alice.getByRole('heading', { name: ru.play.accepted })).toBeVisible();
    const me = alice.getByRole('banner').getByText(/^Alice · \d+$/);
    const meBefore = await me.textContent();

    const seen = hostState.all().length;
    await alice.reload();
    await expect(alice.getByRole('heading', { name: ru.play.accepted })).toBeVisible();
    await expect(alice.getByText(Q1.options[0] ?? '', { exact: true })).toBeVisible();
    await expect(me).toHaveText(meBefore ?? '');
    await shot(alice, 'player-accepted-after-reload');

    // The host saw Alice drop (a grey chip) and come back online in the same seat, her answer kept.
    const aliceOf = (v: HostView) => v.players.find((p) => p.nickname === 'Alice');
    expect(
        hostState
            .all()
            .slice(seen)
            .some((v) => aliceOf(v)?.connected === false),
    ).toBe(true);
    await expect
        .poll(() => {
            const v = hostState.latest();
            const a = v && aliceOf(v);
            return { count: v?.players.length, connected: a?.connected, answered: a?.answered };
        })
        .toEqual({ count: 2, connected: true, answered: true });
});

test('early end is aborted', async ({ page: host, browser }) => {
    await registerHost(host);
    const { pin } = await copyPackAndStart(host, RU_PACK);
    const alice = await newPlayer(browser, 'Pixel 7', pin, 'Alice');
    await host.getByRole('button', { name: ru.host.start }).click();
    await expectQuestionOpen(host, [alice]);

    await host.getByRole('button', { name: ru.host.endEarly }).click();
    const dialog = host.getByRole('dialog', { name: ru.host.endTitle });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: ru.host.endConfirm, exact: true }).click();

    await expect(host.getByText(ru.host.aborted, { exact: true })).toBeVisible();
    await expect(host.getByText(ru.host.savedAborted)).toBeVisible();
    await expect(alice.getByText(ru.play.aborted, { exact: true })).toBeVisible();
    await shot(host, 'host-final-aborted');
    await shot(alice, 'player-final-aborted');

    await host.getByRole('button', { name: ru.host.toStudio }).click();
    await host.getByRole('link', { name: ru.studio.navHistory }).click();
    const row = host.getByRole('row').filter({ hasText: RU_PACK });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(ru.studio.statusAborted);
});
