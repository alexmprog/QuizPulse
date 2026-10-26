# Demo and acceptance scenario

A repeatable walkthrough with real clients against the local stack: a laptop as the big screen and the studio, and two or three phones or tablets as player pads. Use synthetic accounts and nicknames only. This is a test procedure, not evidence that it has already passed.

## Preparation

1. Put the laptop and the phones on the same Wi-Fi network. Get the laptop's address with `tools/dev/lan-url.sh` and put the printed `PUBLIC_BASE_URL=http://<LAN-IP>:8080` line into `.env` (see [Infrastructure](infrastructure.md#reaching-the-app-from-other-devices)).
2. Start the stack: `docker compose up -d --build`. Check `docker compose ps` and `curl --fail http://localhost:3000/healthz`.
3. On the laptop open `http://<LAN-IP>:8080` in a desktop browser, full screen. A 1280 × 720 window or larger matches the design.
4. Prepare a small image (JPEG, PNG or WebP, under 5 MB) for a question.

Without phones, the Android Emulator and the iOS Simulator with their browsers can stand in as pads. The Android Emulator reaches the laptop as `10.0.2.2`; if its network is isolated, `adb reverse tcp:8080 tcp:8080` and `http://localhost:8080` work too. The Wi-Fi loss step then needs the emulator's network toggle.

## Main flow

| Step | Action | Expected result |
| --- | --- | --- |
| 1. Host account | Register a host with a synthetic email. | The studio opens with an empty quiz list. |
| 2. Copy a pack | In Packs open a built-in pack and copy it to your quizzes. | The copy opens in the editor and can be changed; the original pack stays read-only. |
| 3. Edit | Change one question's text, upload the image to it, set the leaderboard to every 3 questions and x2 on the last question. Make sure the quiz has a multiple choice, a true/false and a number guess question, and early close is on. | Autosave reports the quiz as saved. After a reload the changes, the image and the settings are still there. |
| 4. Lobby | Start a game. | The big screen shows a QR code, a 6-digit PIN and an empty player list. No warning under the join address (it appears only for a `localhost` link). |
| 5. Wrong PIN | On a phone open `/play` and enter a wrong PIN. | The pad says the game was not found and stays on the PIN screen. |
| 6. Join | Scan the QR code on every phone, enter nicknames. Join one extra player. | The pad shows the quiz title before the nickname. The big screen lists every player as it joins. |
| 7. Remove | Remove the extra player from the lobby. | That pad shows "You were removed"; the player disappears from the big screen. |
| 8. Questions | Press Start and play through the questions. Let everyone answer one question before the time runs out. | The pads show the option text with colours and shapes. After answering, a pad shows "Answer locked in" with the chosen option and no hint of correctness. When everyone has answered, the question closes early. Results show the correct answer and the answer counts on the big screen, right or wrong and the points on each pad. |
| 9. Leaderboard | Continue past question 3. | The leaderboard appears after questions 3, 6, …; each pad shows its own place out of how many players. |
| 10. Wi-Fi loss | During an open question turn Wi-Fi off on one phone for a few seconds, then back on. | The big screen greys out that nickname and restores it. The phone returns to the same question with its score and the timer still running from the original start, and can answer. A reload of the pad page gives the same result. |
| 11. Pause | Pause during an open question, wait about 10 seconds, resume. | While paused the question is hidden on the big screen and on every pad, which show "Paused", and answers are refused. After resuming the timer continues from the time left at the pause, not from the full time. |
| 12. Final | Finish the quiz, with x2 on the last question. | The last correct answer scores up to 2000. The big screen shows the podium, then the full table. Each pad shows its place and score. |
| 13. History | Open Game history in the studio. | The game is listed as finished, with players, scores and the answers to every question. |
| 14. Early end | Start a second game from the same quiz, play one or two questions, press End early and confirm. | The final appears at once with the "Aborted" note on the big screen and the pads. History lists the game as aborted with the scores at that moment. |
| 15. Language and theme | Switch RU/EN and light/dark in the studio, on the big screen and on a pad; reload. | Every screen changes language and theme, and the choice survives a reload. Quiz content stays in the language it was written in. |

## Automated coverage

The game state machine, scoring and fairness rules are covered by the unit and integration tests (`pnpm check`); a whole game in real browsers by the Playwright tests (`pnpm e2e`). See [Testing](testing.md). They cannot replace steps 10 and 15 on real devices: real Wi-Fi loss, phone sleep and the browsers' own handling of a lost socket.

## Cleanup

`docker compose down` keeps the accounts and history; `docker compose down --volumes` deletes them. Remove `PUBLIC_BASE_URL` from `.env` when the laptop is no longer on that network.
