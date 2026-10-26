# Product and game rules

QuizPulse runs live quizzes for pub quizzes, board-game nights and team events. A host shows the game on a big screen (a laptop or a TV); players scan a QR code and answer from their phone browsers against the clock. The server makes every decision: timer, correctness and score.

## People

- **Host.** Signs up with an email and a password. Builds quizzes in the studio or copies a built-in pack, starts and runs games, and sees the history of their own games.
- **Player.** Has no account. Joins a game by PIN or QR code with a nickname that is unique within the game. A team is an ordinary player with a team name instead of a nickname, one phone or tablet per table. The seat in the game is kept as an opaque token in the browser's `localStorage`.

## Quizzes and packs

A quiz is an ordered list of questions plus settings, and it belongs to its host. The content language is whatever the author wrote; only the interface is localised.

Built-in packs are template quizzes loaded from `apps/api/seed/packs/` on start: general knowledge, science and movies, in Russian and in English. Every host can read them and copy one to their own quizzes to edit it.

| Question type | Player pad | Correct answer |
| --- | --- | --- |
| Multiple choice | 2–4 coloured buttons with shapes and option text | one option |
| True / false | two buttons | one option |
| Number guess | a number field and an Answer button | the closest number, see [Scoring](#scoring) |

Any question can have an image (JPEG, PNG or WebP, up to 5 MB). It is shown on the big screen only; the pad stays a set of buttons. The pad repeats the option text because in a pub the screen may be far away.

Quiz settings:

- **Advance:** to the next question by the host's button, or automatically 3–60 seconds after the results appear.
- **Time to answer:** a quiz default of 5–120 seconds, which each question can override.
- **Early close:** close a question as soon as every connected player has answered. It can be turned off.
- **Leaderboard** every N questions (0 means only at the end) and always at the end.
- **Score multiplier** per question: x1, x2 or x3.

Limits: up to 100 questions, 2–4 options, 50 players per game, nicknames of 1–20 characters, one active game per host.

## Game flow

### Lobby

1. The host picks a quiz and starts a game. The server creates it with a 6-digit PIN.
2. The big screen shows a QR code linking to `<PUBLIC_BASE_URL>/play?pin=…`, the PIN as text and the players who have joined.
3. A player opens the link. The pad checks the PIN first and shows the quiz title, then asks for a nickname.
4. The host can remove a player from the lobby.
5. The host presses Start. After that nobody new can join; players already in the game can come back with their token.

A game closed in the lobby before the start is not saved to history.

### One question

1. **Open.** The big screen shows the question, its options and the image. The server records the start and the deadline. The pad shows the buttons.
2. **Answer.** Each player answers once and cannot change the answer. The server stamps it with its own receive time. The pad shows "Answer accepted" and the chosen option, without saying whether it is right.
3. **Close** happens at the deadline, or earlier when early close is on and every connected player has answered. Late answers are rejected.
4. **Results.** The big screen highlights the correct answer and shows how many players picked each option; for a number guess it shows the correct number and the closest answers. The pad shows right or wrong and the points earned.
5. **Leaderboard** with the top 10, when the question number is a multiple of N.
6. **Next** question, by the host or automatically.

### Final

- The big screen shows a three-place podium, then the full table.
- Each pad shows the player's place, out of how many, and the score.
- The game is saved to the host's history: date, quiz, players, final scores and the answers to every question.

### Ending early

- The host can end the game at any time. After a confirmation the final shows the current scores at once.
- If the host disconnects, the game pauses automatically. If the host does not come back within 30 minutes, the game ends.
- Either way the game is saved with the status **aborted** and the results at that moment. A game played to the end has the status **finished**.

### Pause

The host can pause at any time after the start.

- **Between questions:** the next step waits until the host resumes.
- **During an open question:** the timer stops. The question and options are hidden on the big screen and on every pad, which show "Paused" instead. No answers are accepted; answers already received are kept. After resuming the timer continues from the remaining time.
- Paused time never counts towards an answer's time: answer time is active time since the question opened.

### Connection loss

- The big screen shows each player as online or disconnected (a greyed nickname).
- A player who reloads the page or loses the network reconnects with the token and returns to the same seat and the current state of the game.
- A player who has not answered when a question closes gets 0 points for it, with no penalty.
- A player who returns while the question is still open can answer; the time still counts from the opening.
- Early close only waits for connected players.

## Scoring

For multiple choice and true/false:

```
wrong or no answer:  0
correct answer:      round((1000 − 500 · t / T) · multiplier)
```

`t` is the active time from the question opening to the server receiving the answer, and `T` is the time to answer. An instant correct answer scores 1000, a correct answer in the last moment scores 500.

For a number guess, the question has a correct number and an absolute tolerance, for example ±5:

- An answer within the tolerance is a hit. It scores by the same formula, times an accuracy factor that falls linearly from 1 for the exact number to 0.5 at the edge of the tolerance.
- An answer outside the tolerance scores 0.
- If nobody hits, the player or players with the smallest error get 500 · multiplier as a consolation.

The leaderboard is sorted by total score. On a tie, the player with the lower total time of correct answers ranks higher. A correct answer is one that scored by the main formula: a hit within the tolerance counts, the consolation for the closest miss does not.

For every answer the server keeps the chosen option or number, the active answer time and the points. Scoring lives in the pure `packages/game-engine` module with its own tests.

## Fairness

- The correct answer never reaches any client, pad or big screen, before the question closes.
- Answer time comes only from the server; client timestamps are ignored.
- The server accepts one answer per player per question and rejects answers to a closed or stale question and answers during a pause.
- Host commands (start, next, pause, remove a player, end) are checked against the host session and game ownership.
- Socket messages are rate limited per connection.
- The big screen and the pads draw only what the server's latest snapshot says, so they cannot disagree about the state of the game.

## Interface

- `/login`, `/register`: the host account.
- `/studio`: the quiz list, the quiz and question editor, built-in packs and game history.
- `/host/:gameId`: the big screen with its control panel.
- `/play`: the player pad, mobile first.

The interface is in Russian and English, with light and dark themes. Language and theme follow the browser and the system by default and can be switched.

## Current limits

- No native mobile clients; a pad in the phone browser is the only player client. A future native client could use the [AsyncAPI](../contracts/asyncapi.yaml) description of the same socket protocol.
- No player accounts, no special team logic and no platform admin.
- No streak bonuses, presets, hidden leaderboards or "120 points to third place" hints.
- No quiz import or export and no generated questions.
- One API instance. Live game state is in Redis, so a game survives an API restart, but two instances behind a load balancer are not set up.
- A local demo only: no HTTPS, TLS or production deployment.
