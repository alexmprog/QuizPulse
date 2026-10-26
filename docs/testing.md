# Testing

## Requirements

- Node 24 or newer and pnpm 12, dependencies installed with `pnpm install`.
- A running Docker daemon: the API tests start PostgreSQL, Redis and MinIO with Testcontainers (the same images as in `compose.yaml`). The images must be available locally or pullable. The suite does not need `docker compose up`.
- `shfmt` for the formatting check (`brew install shfmt`).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm check` | everything below, in order: format check, lint, types, tests, contracts |
| `pnpm format` / `pnpm format:check` | `./format-all.sh` (ESLint, Prettier, shfmt), with `--check` it only reports |
| `pnpm lint` | ESLint with type-aware strict rules |
| `pnpm typecheck` | `tsc` in every package |
| `pnpm test` | Vitest in every package |
| `pnpm --filter @quizpulse/api exec vitest run test/restart.e2e.test.ts` | one API test file |
| `pnpm contracts:check` | Redocly lint of OpenAPI, AsyncAPI validation, freshness of the generated types |
| `pnpm --filter @quizpulse/web test` | web unit and component tests only |
| `tools/dev/smoke.sh` | end-to-end scenario against a running `docker compose up` |
| `pnpm e2e` | Playwright tests of the web client against a running stack, see [Web](web.md#end-to-end-tests); not part of `pnpm check` |

API test files start their own containers (up to three files in parallel), so the first run is slow and Docker needs free memory.

## What the tests cover

| Area | Where | Covers |
| --- | --- | --- |
| Scoring and ranking | `packages/game-engine/test/scoring`, `ranking` | formula, time bonus, numeric tolerance, closest-answer fallback, tie-breaking |
| State machine | `reducer.*.test.ts` | lobby rules, question lifecycle, early close, pause and resume, host absence, abort, epochs and stale timers |
| Views and fairness | `views.test.ts` | no correct answer or foreign answers in views before the question closes |
| Protocol | `packages/protocol/test` | zod schemas, limits, AsyncAPI names equal to the socket events |
| Auth, quizzes, packs, images | `apps/api/test/*.int.test.ts` | registration, session, CSRF, quiz validation, seeding and copying packs, image signatures, OpenAPI request and response validation |
| Store and service | `game-store`, `game-service`, `history` | atomic updates under concurrency (two tabs, double tap: exactly one answer), PIN and host slot, deadline after-the-fact refusal, history snapshot independent of quiz edits |
| Sockets | `gateway.e2e.test.ts` | join and rejoin, host commands, rate limit, kick, reconnection and several tabs, no ghost players, races during join |
| Restart | `restart.e2e.test.ts` | a second app on the same Redis and Postgres: presence reconciliation, host resumes, deadline timer still fires, early close not triggered by the restart, unsaved history saved, PIN and slot released |
| Contracts | `pnpm contracts:check` | OpenAPI validity, generated types up to date |
| Web client | `apps/web/src/**/*.test.ts(x)` | screen selection from snapshots, server clock offset, player session and rejoin, CSRF retry, editor autosave and validation, uploads, RU/EN dictionaries |
| Whole stack | `tools/dev/smoke.sh` | a built image playing a full game and writing history |
| Browsers | `apps/web/e2e` | a full game with host and phone players in Chromium and WebKit, pause, reload, early end, RU/EN and themes |

Tests use a fake clock for game timing, so no test waits for real question time.
