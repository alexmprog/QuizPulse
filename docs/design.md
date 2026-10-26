# Design

The web client was designed in Claude Design as a static prototype. Its exported sources and tokens are kept in this repository; the implemented screens are shown in the [screenshots](screenshots/README.md).

| Material | Contents |
| --- | --- |
| [tokens.json](design/tokens.json) | colours of both themes, answer slots, medals, fonts, size scales, spacing, radii, control sizes |
| [prototype/qp.css](design/prototype/qp.css) | CSS tokens and component classes the prototype is built from (`.qp` / `.qp.dark`) |
| [prototype/*.dc.html](design/prototype/) | the 12 artboard sources (Claude Design format; they do not run on their own) and `canvas.json` with the layout. Each artboard has three rows: RU light, RU dark, EN light |

The web client's own tokens are in `apps/web/src/styles/tokens.css`.

## General decisions

- **Character.** A bright, playful look on a neutral cool background: one violet accent for actions, and four saturated colours reserved for answer options only.
- **Fonts.** Unbounded for headings, the PIN, the timer and scores; Onest for everything else. Both have Cyrillic and come from Google Fonts. Numbers are always `tabular-nums`.
- **Themes.** Light and dark through CSS variables on the root. The default theme follows `prefers-color-scheme` and the default language `navigator.language`. RU/EN and theme switches are on the sign-in page, in the studio sidebar, in the lobby header and on the first pad screens. The question screen has none, so nothing distracts.
- **English.** Every screen is laid out with English strings too. Nothing is cut off; long strings such as "Office party 2026: guess the colleague from a baby photo" wrap to two lines. Buttons never have a fixed width.
- **Content is not translated.** Quizzes and packs appear in their author's language: in the English interface a Russian pack is still «Кино и сериалы».

## Tokens

The full list with exact values is in [tokens.json](design/tokens.json). A summary:

### Colours

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `bg` | `#F5F4FA` | `#100E17` | page background |
| `surface` | `#FFFFFF` | `#1A1823` | cards, sidebar, control panel |
| `surface-2` | `#EEECF5` | `#252231` | secondary buttons, segments, timer track |
| `border` | `#DEDAEA` | `#332F42` | borders, dividers |
| `text` | `#17141F` | `#F3F1FA` | main text |
| `muted` | `#5D586C` | `#A7A2B8` | captions, hints |
| `offline` | `#767185` | `#85809A` | an offline player's nickname (with an icon and a dashed border) |
| `accent` / `on-accent` | `#5B3BEF` / `#FFFFFF` | `#8C74FF` / `#140C38` | primary buttons, selection, timer |
| `accent-soft` | `#ECE8FF` | `#261F47` | selected menu item, banner backgrounds |
| `success` / `-soft` | `#12804F` / `#E1F4EA` | `#3CCB86` / `#12301F` | correct, finished, the correct answer |
| `warning` / `-soft` | `#8F5B00` / `#FFF1CF` | `#F5C04A` / `#36290B` | aborted, host disconnected |
| `danger` / `-soft` | `#C9343A` / `#FCE7E8` | `#FF6B70` / `#3B1A1D` | errors, wrong, End early |

Text colours have at least 4.5:1 contrast on their backgrounds. In the dark theme `accent` and `danger` buttons carry dark text rather than white, which would fail the contrast check.

### Answer slots

The same in both themes. Option index `i` in `QuestionPublic.options` maps to a slot:

| Slot | Index | Colour | Text on it | Shape |
| --- | --- | --- | --- | --- |
| A | 0 | `#D6383E` red | white | triangle |
| B | 1 | `#2459D6` blue | white | diamond |
| C | 2 | `#F2B305` yellow | `#1E1600` dark | circle |
| D | 3 | `#12805A` green | white | square |

- True/false: True takes slot B (blue diamond), False takes slot A (red triangle). True comes first on screen.
- Colour is never the only cue: there is always a shape and the option text. Shapes are drawn with CSS `clip-path` (`.shape.tri/.dia/.cir/.sq` in `qp.css`).
- In the results the correct option stays filled and gets a check mark. The other bars fade to 35% opacity and their labels move to `surface-2`, so the text stays readable.

### Medals

Gold `#E3A80F`, silver `#9AA3B2`, bronze `#C0773F`, with dark text. Used on the podium, the leaderboard (places 1–3) and the final screen of the pad.

### Typography

| Surface | Sizes (px) |
| --- | --- |
| Studio and account | 12 table captions · 13 hints · 15 body · 18 card title · 20 section · 28 page title |
| Big screen (1280 × 720 base) | 16 header · 18 lobby nickname · 26 option text · 38–48 question · 56 timer and counter · 52 PIN (one line) · 72 "Paused" · 136 correct number |
| Pad (375 px) | 13 hints · 16 body · 20 option · 28 true/false and headings · 56 points · 120 place |

The big screen is designed at 1280 × 720 and scales proportionally on a TV instead of stretching the grid. The client sets a unit `--u: min(100vw / 1280, 100vh / 720)` and sizes the host screen in it.

### Spacing, radii, sizes

- Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Radii: 8 (sm), 12 (md, buttons and fields), 16 (lg, cards and options), 24 (xl, modals), 999 (pill, badges and player chips).
- Control heights: 36 / 44 / 56 / 64. The minimum touch target is 44 px; answer buttons on the pad are at least 64 px tall.
- Focus: an `accent` border and a 3 px `accent-soft` ring. Error: a `danger` border, a `danger-soft` ring and the error text under the field.

## Screens

Below, each screen lists the `HostView` / `PlayerView` fields (`packages/protocol/src/views.ts`) it is built from.

### Account (`/login`, `/register`)

- On the left, a brand panel in the accent colour: logo, tagline and the hint "Playing? No account needed…".
- On the right, a 400 px form: email, password, a full-width primary button and a link to the other screen. RU/EN and theme at the top right.
- Registration is shown with the "This email is already registered" error: a banner above the form and the highlighted field. The password field has the hint "At least 8 characters".

### Studio (`/studio`)

A shared frame: a 240 px sidebar with My quizzes, Built-in packs and Game history, and RU/EN, theme, email and Sign out at the bottom. On narrow screens the pages fold into one column and the sidebar moves to the top.

- **My quizzes.** A three-column card grid: the title (up to 120 characters, wrapping), "12 questions · edited Oct 21", Start game and Edit, and a More menu. If the host already has a running game (`ACTIVE_GAMES_PER_HOST = 1`), a banner on top offers to return to its screen and Start game is disabled on the cards.
- **Built-in packs.** An All / RU / EN filter and cards with a language badge, the question count, a description, Copy to my quizzes and View. After a copy a toast offers to open it.
- **Game history.** A table of date, quiz, players, the winner with points, a status badge (finished in green, aborted in yellow) and Details. A note under it says that games closed in the lobby are not saved. Below 720 px the rows become cards.
- **Game details** (shown for an aborted game). Title, status, date, a yellow note "The host ended the game on question 7 of 15", three figures (players, questions played, share of correct answers), the final standings and a per-question table (type, x2, "7 / 9 correct").
- **Quiz editor.** Three columns: a 280 px question list (number, one line of text, "type · time · image · x2", the selected one in accent), the question editor and a 300 px Quiz settings panel.
  - Header: "← My quizzes", the quiz title edited in place, a "Saved" or "1 error" status (autosave, no Save button) and Start game, disabled while there are errors.
  - The question type is a segmented control: Choice / True-false / Number. Add question under the list opens a menu of the three types.
  - Question text with an `N / 300` counter.
  - Image: the filled state (preview, file name, "shown on the big screen only", Replace / Remove) and an empty drop zone "JPEG, PNG or WebP, up to 5 MB". Upload states:
    - uploading: a spinner over the preview, a progress bar with a percentage and "2.6 / 4.1 MB", Cancel;
    - a file over 5 MB or of another format (`IMAGE_MAX_BYTES`, `IMAGE_MIME_TYPES`) is refused before upload: the drop zone turns red (`danger` + `danger-soft`) and names the size or format, with "choose a file" next to it;
    - the network or the server refused the file: a preview with a no-connection icon, the error text, Retry and Remove. The question stays without an image and this is not a quiz error.
  - Options (2–4): a slot tile with its shape, the text field, a Correct radio button and remove. "+ Option · 4 / 4" is disabled at the maximum.
  - Number guess: Correct number (shown with the "Enter the correct number" error), Tolerance ±, and an explanation of the scoring rule.
  - At the bottom of a question: Time for this question (Quiz default / Custom + seconds) and the x1 / x2 / x3 multiplier.
  - Quiz settings: advance Manual / Auto (with "after N s", 3–60, for Auto), the default time to answer (5–120), a Close early switch, and Leaderboard every N questions with the hint "0 — only at the end".

### Host big screen (`/host/:gameId`)

A 1280 × 720 frame: a 64 px header (logo, "Question 3 / 12", an x2 badge, the PIN small on the right), the main area and an 80 px control panel at the bottom on `surface`. Everything is meant to be read from 3–5 metres: at least 16 px in service lines and 26 px in options.

| Screen | When | Contents | Panel buttons |
| --- | --- | --- | --- |
| Lobby | `phase = lobby` | QR code (always black on white), the `…/play` address, a 52 px PIN on one line, "Players 14 / 50", player chips | Close game · **Start** (disabled without players) |
| Empty lobby | `players = []` | A dashed "Waiting for players…" area with a spinner | the same, Start disabled |
| Question: choice | `question_open`, a choice type | Question text, a timer ring, a 400 × 225 image, "9 / 14 answered", a 2 × 2 option grid | End early · Pause |
| Question: true/false | the same | Timer, large question text, two 160 px tiles | the same |
| Question: number | the same, number type | Question text, timer, a card "Enter a number on your phone". The tolerance is hidden until the question closes | the same |
| Paused | `pause != null` in any phase | Question and options hidden. A pause icon, "Paused", "17 s left after resume", "9 of 14 answered" | End early · **Resume** |
| Results: choice | `question_results`, `optionCounts` | A bar per option with counts, the correct one filled with a check mark, "No answer: 2" | End early · Pause · **Next →** |
| Results: number | `question_results`, `numericAnswer` | The correct number at 136 px, "tolerance ±5", "Closest": three rows with their error (a green badge means within tolerance) | with `autoAdvance`, "Next question in 6 s" with a progress bar on the left; Next → stays |
| Leaderboard | `leaderboard` | Top 10: place (1–3 in medal colours), nickname, points | End early · Pause · **Question 4 →** |
| Final: podium | `finished` | "Game over!", a 2–1–3 podium with avatar, nickname and points | To the studio · **Full table** |
| Final: table | `finished`, shown with `outcome = aborted` | An Aborted badge with "on question 7 of 12", all players in two columns | Podium · **To the studio** |
| End early | by the button | A modal over the current screen: "End the game early?", explaining the aborted status | Keep playing · **End game** (danger) |
| Connection lost | the host socket disconnected | A dimmed last screen with a `role="status"` card and a spinner: "Connection to the server lost · Reconnecting…", a yellow "Game auto-paused" badge | all buttons disabled |
| Back after a drop | `pause.reason = host_disconnected` | Like Paused with the icon in `warning`: "Game paused · The host screen was disconnected…", "14 s left", "13 of 14 online", and "Without a host the game ends by itself in 30 minutes" (`HOST_ABSENT_MS`) | End early · **Resume** |

Details:

- A player chip is the nickname and a × button (remove from the game, `aria-label="Remove <nickname>"`). An offline player has the `offline` colour, a dashed border and a no-network icon, explained by a legend under the list. Removal is immediate, without confirmation, with a "Player … removed" toast.
- The × button exists only in the lobby. After the start the online status keeps arriving in `players[].connected`.
- The timer is a `conic-gradient` ring with the number of seconds. It counts from `countdown.closesAt` and `serverNow`, not from local time.
- The podium appears with an animation: 3rd place, then 2nd, then 1st, the pedestals growing from below (about 400 ms each). With `prefers-reduced-motion` it appears at once.

### Player pad (`/play`)

375 px wide, mobile first. At the top a "nickname · points" line and a "3 / 12" badge, below it the timer bar with seconds. The pad does not show the question text, only the hint "The question is on the big screen" and the options with their text.

| Screen | When | Contents |
| --- | --- | --- |
| PIN | no `pin` in the URL | "Join a game", a 64 px PIN field (`inputmode="numeric"`), Next |
| Wrong PIN | no game with that PIN | The PIN field in the error state with "No game with PIN 482 931. Check the digits on the host screen". The digits are kept |
| Nickname | the PIN is known (from the QR code) | A game card (quiz title, PIN), a "Nickname or team name" field with an `N / 20` counter, Join |
| Nickname taken | join error | The field in the error state with "The nickname “Cat” is already taken in this game…" |
| Game started | join error | A message screen suggesting the same link for players already in the game, and Enter another PIN |
| Game full | join error | "No seats · The game already has 50 players", and Enter another PIN |
| Lobby | `phase = lobby` | An initial avatar, the nickname, "You're in", "Waiting for the host to start", the quiz card |
| Answer: choice | `question_open`, `answered = false` | 2–4 full-width buttons sharing the height: colour + shape + text |
| Answer: true/false | the same | Two large buttons, True on top |
| Answer: number | the same, number type | An 88 px field (`inputmode="decimal"`), Answer, "You can send one answer". The system keyboard is not drawn |
| Answer accepted | `answered = true` | A check mark, "Answer locked in", the tile of the chosen option (`myAnswer`), "You'll find out if it's right when time runs out" |
| Paused (host) | `pause.reason = host` | A pause icon, "The host paused the game…". Answer buttons hidden |
| Paused (host disconnected) | `pause.reason = host_disconnected` | A screen icon, "Waiting for the host… your points are kept" |
| Correct | `question_results`, `myResult.correct` | `success-soft` background, "Correct!", "+840", "Total 2 680" |
| Wrong | `myResult.correct = false` | `danger-soft` background, "Wrong", "+0", "The correct answer is on the big screen" |
| Time's up | `question_results`, no answer (`answered = false`) | A neutral `surface-2` background, a clock icon, "Time's up", "+0", "No answer in time — 0 points for this question, no penalty", Total. Not red: this is not the player's mistake |
| Place | `leaderboard` | "Your place" at 120 px, "of 14 players" (`playerCount`), points (`me.rank`, `me.score`) |
| Final | `finished` | "Game over", a circle with the place in its medal colour, points, a mini podium from `podium` with the player highlighted |
| Removed | the kick event | "You were removed from the game", Enter a PIN. The token is deleted from localStorage |
| Game closed | the game no longer exists | "Game closed · Thanks for playing!", Enter a PIN |
| Reconnecting | the socket is lost | A dimmed current screen with a spinner card "Reconnecting… Your seat and points are kept" |

## Accessibility

- Every interactive element is a real `<button>`, `<a>` or `<input>` with a `<label>`. Icon buttons have an `aria-label`.
- An answer on the pad is never told apart by colour alone: there is always a shape and text. The red and green slots also differ by shape (triangle / square).
- Reconnection is announced with `role="status"`; the End early modal is `role="dialog" aria-modal="true"` and keeps focus inside.
- The timer is also shown as a number of seconds. Animations (podium, timer bar) are off with `prefers-reduced-motion`.

## Prototype limits

- The prototype is static: buttons lead nowhere and there are no sockets or REST calls. All data (nicknames, questions, points, dates) is synthetic and shows the layout only.
- The QR code is a drawn placeholder with correct finder marks and does not scan. The application generates the QR code from `HostView.joinUrl`.
- Question images are grey placeholders with an icon.
- Timers are frozen at demo values. Animations (podium, toasts, phase transitions) are not in the prototype; they are described above.
- Not drawn: the mobile layout of the studio and account pages, empty quiz and history lists, the pack view, deleting a quiz or a question, the "Wrong email or password" sign-in error, the Close game confirmation in the lobby, player online status during a question, an English leaderboard with 20-character nicknames on two lines, and big-screen scaling on a TV (everything is drawn at 1280 × 720).
- The [product rules](product.md) and the protocol (`packages/protocol`) take precedence over the prototype. Where they differ, the protocol is right.
