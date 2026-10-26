export const NICKNAME_MIN = 1;
export const NICKNAME_MAX = 20;
export const MAX_PLAYERS = 50;

export const QUIZ_TITLE_MIN = 1;
export const QUIZ_TITLE_MAX = 120;
export const QUESTION_TEXT_MIN = 1;
export const QUESTION_TEXT_MAX = 300;
export const OPTION_TEXT_MIN = 1;
export const OPTION_TEXT_MAX = 80;
export const CHOICE_OPTIONS_MIN = 2;
export const CHOICE_OPTIONS_MAX = 4;
export const QUESTIONS_MIN = 1;
export const QUESTIONS_MAX = 100;

export const TIME_LIMIT_MIN_SECONDS = 5;
export const TIME_LIMIT_MAX_SECONDS = 120;
export const TIME_LIMIT_DEFAULT_SECONDS = 20;

export const AUTO_ADVANCE_MIN_SECONDS = 3;
export const AUTO_ADVANCE_MAX_SECONDS = 60;
export const AUTO_ADVANCE_DEFAULT_SECONDS = 8;

export const LEADERBOARD_EVERY_MIN = 0;
export const LEADERBOARD_EVERY_MAX = 50;
export const LEADERBOARD_EVERY_DEFAULT = 5;

export const MULTIPLIERS = [1, 2, 3] as const;

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const PIN_LENGTH = 6;

export const HOST_ABSENT_MS = 30 * 60 * 1000;

export const SOCKET_RATE_LIMIT_BUCKET = 10;
export const SOCKET_RATE_LIMIT_REFILL_PER_SECOND = 5;

export const ACTIVE_GAMES_PER_HOST = 1;

export const STATE_TTL_SECONDS = 24 * 60 * 60;
export const FINISHED_STATE_TTL_SECONDS = 60 * 60;
