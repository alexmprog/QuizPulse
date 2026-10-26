import { expect, test, type Page } from '@playwright/test';
import { MAX_PLAYERS } from '@quizpulse/protocol';
import {
    closePlayers,
    copyPackAndStart,
    joinGame,
    newPlayer,
    openPlayer,
    registerHost,
    ru,
    RU_PACK,
    shot,
} from './support';

/** Questions kept from the RU pack «Всё обо всём»: choice, true/false, choice, numeric, choice. */
const QUESTIONS_KEPT = 5;
/** Default time per question set in the editor: answered questions close early, the unanswered one waits it out. */
const DEFAULT_SECONDS = '8';

/** Each question as seen in `apps/api/seed/packs/ru-general.json`: what Alice (right) and Bob (wrong) answer. */
const PLAN = [
    { text: 'Какой город является столицей Канады?', right: 'Оттава', wrong: 'Торонто' },
    { text: 'Кит — это рыба.', right: ru.play.optionFalse, wrong: ru.play.optionTrue },
    { text: 'Кто автор романа «Война и мир»?', right: 'Лев Толстой', wrong: 'Иван Тургенев' },
    { text: 'Сколько клавиш на стандартном фортепиано?', right: '88', wrong: '50', numeric: true },
] as const;

test.afterEach(closePlayers);

/** The editor tweaks for a fast game: five questions, 8 s each, a leaderboard every 3 questions. */
async function shortenQuiz(page: Page): Promise<void> {
    await page.getByLabel(ru.editor.leaderboardEvery).fill('3');
    await page.getByLabel(ru.editor.defaultTime).fill(DEFAULT_SECONDS);
    const items = page.getByRole('list', { name: ru.editor.questionsList }).getByRole('button');
    for (let count = await items.count(); count > QUESTIONS_KEPT; count--) {
        await items.last().click();
        await page.getByRole('button', { name: ru.editor.deleteQuestion }).click();
        await expect(items).toHaveCount(count - 1);
    }
}

async function answer(player: Page, value: string, numeric: boolean): Promise<void> {
    if (numeric) {
        await player.getByLabel(ru.play.yourNumber).fill(value);
        await player.getByRole('button', { name: ru.play.answer }).click();
    } else {
        await player.getByRole('button', { name: value, exact: true }).click();
    }
    // The last answer closes the question at once, so its sender may skip «accepted» and land on the result.
    const done = [ru.play.accepted, ru.play.correct, ru.play.wrong].map((name) =>
        player.getByRole('heading', { name, exact: true }),
    );
    await expect(done.reduce((a, b) => a.or(b))).toBeVisible();
}

test('full game', async ({ page: host, browser }) => {
    await registerHost(host);
    const { pin } = await copyPackAndStart(host, RU_PACK, shortenQuiz);
    await expect(host.getByText(ru.host.waiting)).toBeVisible();
    await shot(host, 'host-lobby-empty');

    // A wrong PIN is refused on the PIN screen (`player:lookup`), then the same phone joins with the right one.
    const bob = await openPlayer(browser, 'Pixel 7');
    const wrongPin = pin === '000000' ? '111111' : '000000';
    await bob.getByLabel(ru.play.pin).fill(wrongPin);
    await bob.getByRole('button', { name: ru.play.next }).click();
    await expect(bob.getByRole('alert')).toHaveText(
        ru.play.pinNotFound(`${wrongPin.slice(0, 3)} ${wrongPin.slice(3)}`),
    );
    await shot(bob, 'player-wrong-pin');
    await joinGame(bob, pin, 'Bob');

    const alice = await newPlayer(browser, 'iPhone 13', pin, 'Alice');
    const carol = await newPlayer(browser, 'Pixel 7', pin, 'Carol');
    await expect(host.getByText(ru.host.playersCount(3, MAX_PLAYERS))).toBeVisible();
    await shot(host, 'host-lobby-3-players');

    // The host removes Carol from the lobby.
    await host.getByRole('button', { name: ru.host.kick('Carol') }).click();
    await expect(carol.getByRole('heading', { name: ru.play.kicked })).toBeVisible();
    await expect(host.getByText(ru.host.playersCount(2, MAX_PLAYERS))).toBeVisible();
    await shot(carol, 'player-kicked');

    await host.getByRole('button', { name: ru.host.start }).click();

    for (const [i, q] of PLAN.entries()) {
        const numeric = 'numeric' in q;
        await expect(host.getByRole('heading', { name: q.text })).toBeVisible();
        await expect(host.getByText(ru.host.questionOf(i + 1, QUESTIONS_KEPT))).toBeVisible();
        await shot(host, `host-question-${String(i + 1)}`);
        await shot(alice, `player-question-${String(i + 1)}`);
        await answer(alice, q.right, numeric);
        await answer(bob, q.wrong, numeric);

        // Everyone answered: the question closes early and shows its results.
        await expect(host.getByText(ru.host.noAnswer(0))).toBeVisible();
        if (numeric) await expect(host.getByRole('heading', { name: ru.host.closest })).toBeVisible();
        else await expect(host.getByText(ru.host.correct)).toBeAttached();
        await expect(alice.getByRole('heading', { name: ru.play.correct })).toBeVisible();
        await expect(bob.getByRole('heading', { name: ru.play.wrong })).toBeVisible();
        await shot(host, `host-results-${String(i + 1)}`);
        await shot(alice, `player-result-${String(i + 1)}`);

        await host.getByRole('button', { name: ru.host.next }).click();
        if (i === 2) {
            // leaderboardEvery = 3: the leaderboard comes after the third question.
            await expect(host.getByRole('heading', { name: ru.host.leaderboard })).toBeVisible();
            await expect(host.getByRole('listitem').first()).toContainText('Alice');
            await expect(alice.getByText(ru.play.yourPlace)).toBeVisible();
            await expect(bob.getByText(ru.play.ofPlayers(2))).toBeVisible();
            await shot(host, 'host-leaderboard');
            await shot(bob, 'player-rank');
            await host.getByRole('button', { name: ru.host.nextQuestion(4) }).click();
        }
    }

    // The last question nobody answers: it closes on its timer, then «Next» goes straight to the final.
    await expect(host.getByText(ru.host.questionOf(QUESTIONS_KEPT, QUESTIONS_KEPT))).toBeVisible();
    await expect(host.getByText(ru.host.noAnswer(2))).toBeVisible({ timeout: 20_000 });
    await expect(alice.getByRole('heading', { name: ru.play.timeUp })).toBeVisible();
    await host.getByRole('button', { name: ru.host.next }).click();

    await expect(host.getByRole('heading', { name: ru.host.over })).toBeVisible();
    await expect(host.getByText(ru.host.completed, { exact: true })).toBeVisible();
    await expect(host.getByText(ru.host.saved)).toBeVisible();
    await expect(alice.getByRole('heading', { name: ru.play.over })).toBeVisible();
    await expect(alice.getByRole('list', { name: ru.play.podium })).toContainText('Alice');
    await expect(bob.getByText(ru.play.completed, { exact: true })).toBeVisible();
    await shot(host, 'host-podium');
    await shot(alice, 'player-final');

    await host.getByRole('button', { name: ru.host.toStudio }).click();
    await host.getByRole('link', { name: ru.studio.navHistory }).click();
    const row = host.getByRole('row').filter({ hasText: RU_PACK });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(ru.studio.statusCompleted);
    await expect(row).toContainText(ru.studio.winnerScore('Alice', ''));
    await shot(host, 'studio-history');
});
