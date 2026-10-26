import {
    AUTO_ADVANCE_DEFAULT_SECONDS,
    LEADERBOARD_EVERY_DEFAULT,
    TIME_LIMIT_DEFAULT_SECONDS,
} from '@quizpulse/protocol';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorText } from '../i18n/errors';
import { useI18n, type Dict, type Lang } from '../i18n/i18n';
import { useToast } from '../ui/Toast';
import { api, ApiError, type Schemas } from './client';

export const gamesApi = {
    create: (quizId: string) => api<Schemas['GameCreated']>('POST', '/api/v1/games', { quizId }),
    /** The host's running game, or null when there is none (404). */
    active: async (): Promise<Schemas['GameCreated'] | null> => {
        try {
            return await api<Schemas['GameCreated']>('GET', '/api/v1/games/active');
        } catch (e) {
            if (e instanceof ApiError && e.status === 404) return null;
            throw e;
        }
    },
};

/** Creates a game and opens the host screen; an already running game is opened instead. */
export function useStartGame(): { start: (quizId: string) => Promise<void>; pending: boolean } {
    const navigate = useNavigate();
    const notify = useToast();
    const { t } = useI18n();
    const [pending, setPending] = useState(false);

    const start = useCallback(
        async (quizId: string) => {
            setPending(true);
            try {
                const game = await gamesApi.create(quizId);
                void navigate(`/host/${game.gameId}`);
            } catch (e) {
                if (e instanceof ApiError && e.code === 'ACTIVE_GAME_EXISTS' && e.gameId) {
                    void navigate(`/host/${e.gameId}`);
                } else {
                    notify(errorText(t, e instanceof ApiError ? e.code : 'INTERNAL_ERROR'));
                }
            } finally {
                setPending(false);
            }
        },
        [navigate, notify, t],
    );
    return { start, pending };
}

/** A fresh quiz for the "Create quiz" button: defaults from the protocol limits and one two-option question. */
export function newQuizInput(t: Dict, lang: Lang): Schemas['QuizInput'] {
    return {
        title: t.studio.newQuizTitle,
        language: lang,
        settings: {
            advanceMode: 'manual',
            autoAdvanceSeconds: AUTO_ADVANCE_DEFAULT_SECONDS,
            defaultTimeLimitSeconds: TIME_LIMIT_DEFAULT_SECONDS,
            earlyClose: true,
            leaderboardEvery: LEADERBOARD_EVERY_DEFAULT,
        },
        questions: [
            {
                type: 'single_choice',
                text: t.studio.newQuestionText,
                imageId: null,
                timeLimitSeconds: null,
                multiplier: 1,
                options: [t.studio.newOption(1), t.studio.newOption(2)],
                correctOption: 0,
                numericAnswer: null,
                numericTolerance: null,
            },
        ],
    };
}
