# QuizPulse screenshots

Captured on 2026-10-26 from one real game against the local Docker Compose stack. The host ran **Friday pub quiz**, a six-question copy of the built-in English pack with an image on the first question, x2 on the last one and a leaderboard every three questions. Eleven players took part: Mia on the iOS Simulator, Leo on the Android Emulator, and nine scripted socket players. All accounts and nicknames are synthetic; no credentials or player tokens are shown.

The join address on the lobby is the documentation example `192.168.1.42:8080`, set through `PUBLIC_BASE_URL` for the capture; the phones opened the game on `localhost`. Everything is in English; the Russian interface uses the same layouts.

## Player pad

Safari on an iPhone 15 Pro simulator (iOS 17.5) in the dark theme, Chrome on a Pixel 8 Pro emulator (Android 14) in the light theme. The emulator has no internet access, so Chrome shows its offline notice and the pad falls back to system fonts instead of Unbounded and Onest.

| Screen | iOS, dark | Android, light |
| --- | --- | --- |
| Joining | <img src="ios/01-lobby.png" alt="iOS: in the lobby" width="280"> | <img src="android/01-join.png" alt="Android: nickname after the PIN check" width="280"> |
| Multiple choice | <img src="ios/02-question.png" alt="iOS: multiple choice question" width="280"> | <img src="android/02-question.png" alt="Android: multiple choice question" width="280"> |
| Answer locked in | <img src="ios/03-answer-locked.png" alt="iOS: answer locked in" width="280"> | <img src="android/03-answer-locked.png" alt="Android: answer locked in" width="280"> |
| Correct | <img src="ios/04-correct.png" alt="iOS: correct answer with points" width="280"> | <img src="android/04-correct.png" alt="Android: correct answer with points" width="280"> |
| No answer or a wrong one | <img src="ios/05-time-up.png" alt="iOS: time's up" width="280"> | <img src="android/05-wrong.png" alt="Android: wrong answer" width="280"> |
| Number guess and true/false | <img src="ios/07-number.png" alt="iOS: number guess" width="280"> | <img src="android/06-true-false.png" alt="Android: true or false" width="280"> |
| Place after the leaderboard | <img src="ios/06-place.png" alt="iOS: place of 11 players" width="280"> | <img src="android/07-place.png" alt="Android: place of 11 players" width="280"> |
| Final | <img src="ios/08-final.png" alt="iOS: final place and podium" width="280"> | <img src="android/08-final.png" alt="Android: final place and podium" width="280"> |

## Big screen

Desktop Chromium at 1280 × 720 CSS pixels, the size the host screen is designed for.

### Lobby with the QR code

![Big screen: lobby](web/01-lobby.png)

### Question with an image

![Big screen: question](web/02-question.png)

### Results

![Big screen: answer distribution](web/03-results.png)

### Leaderboard

![Big screen: leaderboard](web/04-leaderboard.png)

### Podium

![Big screen: podium](web/05-podium.png)

### Dark theme

![Big screen: true/false question in the dark theme](web/11-question-dark.png)

![Big screen: podium in the dark theme](web/12-podium-dark.png)

## Studio

### My quizzes

The Russian pack keeps its Russian title in the English interface: quiz content is never translated.

![Studio: my quizzes](web/06-studio.png)

### Quiz editor

![Studio: quiz editor](web/07-editor.png)

### Built-in packs

![Studio: built-in packs](web/08-packs.png)

### Game history

An earlier game ended early is listed as aborted.

![Studio: game history](web/09-history.png)

### Game details

![Studio: game details](web/10-game-details.png)

### Dark theme

![Studio: my quizzes in the dark theme](web/13-studio-dark.png)
