# Web client

`apps/web` is the single-page client: the studio (accounts, quizzes, packs, history), the big-screen host view and the phone controller for players. It is React 19 + Vite + React Router, talks to the backend only through the same origin (`/api/...` and `/socket.io`), and takes all REST types from `@quizpulse/api-types` and all socket types and limits from `@quizpulse/protocol`.

## Layout

```
apps/web/src
  api/        REST client (CSRF handling, one module per resource)
  auth/       AuthProvider, RequireAuth
  game/       socket layer: socket.ts, useHostGame, usePlayerGame, clock, playerSession
  i18n/       RU/EN dictionaries, errorText(code), formatters
  theme/      light/dark theme provider
  styles/     tokens.css (design tokens) and per-area stylesheets
  ui/         shared components (Button, Field, Modal, Toast, AnswerSlot, ...)
  pages/
    auth/     login, register
    studio/   quizzes, editor, packs, history
    host/     big screen (/host/:gameId)
    play/     phone controller (/play)
  test/       fake socket / XHR and fixtures for tests
```

## Routes

| Route                  | Screen                                  | Auth |
| ---------------------- | --------------------------------------- | ---- |
| `/`                    | redirects to `/studio`                  |      |
| `/login`, `/register`  | sign in / sign up (`?next=` is honoured) |      |
| `/studio`              | quiz list                               | yes  |
| `/studio/quizzes/:id`  | quiz editor with autosave               | yes  |
| `/studio/packs`, `/studio/packs/:id` | question packs            | yes  |
| `/studio/history`, `/studio/history/:gameId` | finished games    | yes  |
| `/host/:gameId`        | big-screen host view (designed for 1280x720, scaled by `--u`) | yes |
| `/play`, `/play?pin=`  | player controller (PIN, nickname, answers) |   |

Anything else renders a "not found" page.

## Running

### Docker (production-like)

```sh
docker compose up -d --build
```

The `web` service (Nginx, port 8080) serves the Vite build and proxies `/api/` and `/socket.io/` to `api:3000`, so the app is at `http://localhost:8080`. `PUBLIC_BASE_URL` (used by the API for the join link and QR code) defaults to `http://localhost:8080`; set it to `http://<LAN-IP>:8080` when phones join from the home network (the host lobby warns under the join address while the link points at `localhost` or `127.0.0.1`). Nginx forwards `Host` and `X-Forwarded-Host` as `$http_host` (port included): the gateway's same-origin check for sockets depends on it.

### Development

Start the backend (`docker compose up -d`, or run the API on `:3000`), then:

```sh
pnpm --filter @quizpulse/web dev
```

Vite serves on `http://localhost:5173` (bound to all interfaces) and proxies `/api` and `/socket.io` (with WebSocket upgrade) to `http://localhost:3000`. To test the controller on a phone, open `http://<LAN-IP>:5173/play`.

## Socket layer and the "screen from the snapshot" rule

`game/socket.ts` creates the `/game` namespace socket on the page origin and wraps every call in `emitAck`, which never rejects: a missing ack within 8 s becomes `INTERNAL_ERROR`. `useHostGame` and `usePlayerGame` own the connection, reconnects and rejoin.

The server sends a full snapshot (`HostView` / `PlayerView`) on join and on every state change. The screen shown is a pure function of the latest snapshot (`hostScreen.ts`, `playerScreen.ts`); local state is limited to things like "a command is in flight". Consequences:

- A reload or reconnect shows the correct screen after the next snapshot, including "answer accepted" with the chosen option from `PlayerView.myAnswer`.
- A failed ack (`ALREADY_ANSWERED`, `QUESTION_CLOSED`, `INVALID_PHASE`) does not break a screen; the next snapshot corrects it.
- Buttons are disabled until the ack arrives, so double taps send one event.
- Timers count down from `countdown.closesAt` using the offset `serverNow - Date.now()` taken when the snapshot arrives, so a wrong phone clock does not matter. While paused, `remainingMs` is shown.
- The player session (`qp.player` in localStorage) is erased on `GAME_NOT_FOUND` / `INVALID_TOKEN` or when the PIN in the URL differs; `KICKED` shows the "removed" screen.

REST: every state-changing request carries `X-CSRF-Token`; on `CSRF_INVALID` the client fetches a new token once and retries; on `UNAUTHENTICATED` it goes to `/login?next=...`. An autosave refused that way first stashes the draft in sessionStorage (`qp.draft.<quizId>`); after the next sign-in the editor puts it back over the loaded quiz, autosave sends it and the first successful save drops the stash. A host screen whose `host:join` is refused with `UNAUTHENTICATED` clears the signed-in state too, so it lands on the login page once.

## i18n and themes

All UI text comes from the RU and EN dictionaries (`i18n/ru.ts`, `i18n/en.ts`); API errors are shown through `errorText(code)`, never as raw codes. Quiz content (titles, questions, options, nicknames) is not translated. The default language comes from `navigator.language` (`ru*` gives Russian, otherwise English), the default theme from `prefers-color-scheme`; the user's choice is stored in localStorage (`qp.lang`, `qp.theme`) and `<html lang>` follows it. Colours and sizes come from `styles/tokens.css`. Answer slots always combine colour with a shape and text (A red triangle, B blue diamond, C yellow circle, D green square); True/False maps to slots B and A and is sent as option `0` / `1`.

## Tests

```sh
pnpm --filter @quizpulse/web test     # Vitest + Testing Library, jsdom
pnpm check                            # format, lint, typecheck, all tests, contracts
```

Socket tests use `test/fakeSocket.ts`; uploads use `test/fakeXhr.ts`.

## End-to-end tests

`apps/web/e2e` holds Playwright tests that drive the real stack: the host in desktop Chromium (1280x720) and two or three players in the same test, on phone descriptors (`iPhone 13` in WebKit, `Pixel 7` in Chromium).

| File                | Covers                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `game.e2e.ts`       | full game: register, copy a pack, editor settings, wrong PIN, join, kick, all three question types, leaderboard, podium, history |
| `interrupt.e2e.ts`  | pause hides the question and keeps the timer; a player reload keeps the seat and answer; early end is «aborted» |
| `prefs.e2e.ts`      | screenshots of login, studio, lobby, question and result in RU/EN x light/dark; no Russian UI on EN screens |

Prerequisites:

- The stack is running with a web image built from the current sources: `docker compose up -d --build` (web on `http://localhost:8080`). Alternatively run the API on `:3000` and `pnpm --filter @quizpulse/web dev`, then set `E2E_BASE_URL=http://localhost:5173`.
- Browsers, once per machine: `pnpm --filter @quizpulse/web exec playwright install chromium webkit`.

```sh
pnpm e2e                                   # all e2e tests (one worker, no retries)
pnpm --filter @quizpulse/web e2e interrupt # one file
pnpm --filter @quizpulse/web exec playwright show-report
```

`pnpm e2e` is not part of `pnpm check`: it needs Docker and a running stack. Every test registers its own host through `/register` (`e2e+<timestamp>-<random>@example.test`, a password generated per run), so tests do not depend on each other or on order; the accounts stay in the database. Built-in packs are picked by title, never by position. Locators use roles and accessible names, with texts taken from the RU/EN dictionaries.

Screenshots are attached to the HTML report (`apps/web/playwright-report`, open with `show-report`); traces and failure screenshots land in `apps/web/test-results`. Both directories are ignored by Git, Prettier and ESLint.

## Known gaps and notes

- The player pad was checked by hand in Safari on the iOS Simulator and in Chrome on the Android Emulator; real phones on a home Wi-Fi network have not been tried yet. Follow the [demo scenario](demo-scenario.md) for that.
- The production bundle is about 509 kB (Vite warns above 500 kB); the `/host` route could be lazy-loaded.
- Fonts come from Google Fonts. Without internet access the interface falls back to system fonts.
