import { sql } from 'drizzle-orm';
import {
    boolean,
    customType,
    doublePrecision,
    index,
    integer,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uuid,
} from 'drizzle-orm/pg-core';

/** Case-insensitive text (extension `citext`, created by the first migration). */
const citext = customType<{ data: string }>({
    dataType() {
        return 'citext';
    },
});

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
    id: uuid('id')
        .primaryKey()
        .default(sql`gen_random_uuid()`),
    email: citext('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    createdAt: createdAt(),
});

export const quizzes = pgTable(
    'quizzes',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        // NULL owner marks a built-in pack.
        ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
        packKey: text('pack_key').unique(),
        language: text('language'),
        title: text('title').notNull(),
        advanceMode: text('advance_mode').notNull(),
        autoAdvanceSeconds: integer('auto_advance_seconds').notNull(),
        defaultTimeLimitSeconds: integer('default_time_limit_seconds').notNull(),
        earlyClose: boolean('early_close').notNull(),
        leaderboardEvery: integer('leaderboard_every').notNull(),
        createdAt: createdAt(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index('quizzes_owner_id_idx').on(table.ownerId)],
);

export const images = pgTable('images', {
    id: uuid('id')
        .primaryKey()
        .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id')
        .notNull()
        .references(() => users.id),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: createdAt(),
});

export const questions = pgTable(
    'questions',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        quizId: uuid('quiz_id')
            .notNull()
            .references(() => quizzes.id, { onDelete: 'cascade' }),
        position: integer('position').notNull(),
        type: text('type').notNull(),
        text: text('text').notNull(),
        imageId: uuid('image_id').references(() => images.id, { onDelete: 'set null' }),
        timeLimitSeconds: integer('time_limit_seconds'),
        multiplier: integer('multiplier').notNull(),
        options: jsonb('options'),
        correctOption: integer('correct_option'),
        numericAnswer: doublePrecision('numeric_answer'),
        numericTolerance: doublePrecision('numeric_tolerance'),
    },
    (table) => [unique('questions_quiz_id_position_unique').on(table.quizId, table.position)],
);

export const games = pgTable(
    'games',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        hostId: uuid('host_id')
            .notNull()
            .references(() => users.id),
        quizId: uuid('quiz_id').references(() => quizzes.id, { onDelete: 'set null' }),
        quizTitle: text('quiz_title').notNull(),
        status: text('status').notNull(),
        startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
        endedAt: timestamp('ended_at', { withTimezone: true }),
        quizSnapshot: jsonb('quiz_snapshot').notNull(),
    },
    (table) => [index('games_host_id_idx').on(table.hostId)],
);

export const gamePlayers = pgTable(
    'game_players',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        gameId: uuid('game_id')
            .notNull()
            .references(() => games.id, { onDelete: 'cascade' }),
        nickname: text('nickname').notNull(),
        finalScore: integer('final_score').notNull(),
        finalRank: integer('final_rank').notNull(),
    },
    (table) => [index('game_players_game_id_idx').on(table.gameId)],
);

export const gameAnswers = pgTable(
    'game_answers',
    {
        gameId: uuid('game_id')
            .notNull()
            .references(() => games.id, { onDelete: 'cascade' }),
        playerId: uuid('player_id')
            .notNull()
            .references(() => gamePlayers.id, { onDelete: 'cascade' }),
        questionIndex: integer('question_index').notNull(),
        answer: jsonb('answer'),
        activeMs: integer('active_ms').notNull(),
        points: integer('points').notNull(),
        correct: boolean('correct').notNull(),
    },
    (table) => [primaryKey({ columns: [table.gameId, table.playerId, table.questionIndex] })],
);
