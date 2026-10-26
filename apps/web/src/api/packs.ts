import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorText } from '../i18n/errors';
import { useI18n } from '../i18n/i18n';
import { useToast } from '../ui/Toast';
import { api, ApiError, type Schemas } from './client';

export const packsApi = {
    list: (language?: 'ru' | 'en') =>
        api<Schemas['QuizSummary'][]>('GET', language ? `/api/v1/packs?language=${language}` : '/api/v1/packs'),
    get: (id: string) => api<Schemas['Quiz']>('GET', `/api/v1/packs/${id}`),
    copy: (id: string) => api<Schemas['Quiz']>('POST', `/api/v1/packs/${id}/copy`),
};

/** Copies a pack into the host's quizzes and announces it with a toast that opens the copy. */
export function useCopyPack(): { copy: (pack: { id: string; title: string }) => Promise<void>; pending: boolean } {
    const navigate = useNavigate();
    const notify = useToast();
    const { t } = useI18n();
    const [pending, setPending] = useState(false);

    const copy = useCallback(
        async (pack: { id: string; title: string }) => {
            setPending(true);
            try {
                const quiz = await packsApi.copy(pack.id);
                notify(t.studio.packCopied(pack.title), {
                    label: t.studio.open,
                    onClick: () => {
                        void navigate(`/studio/quizzes/${quiz.id}`);
                    },
                });
            } catch (e) {
                notify(errorText(t, e instanceof ApiError ? e.code : 'INTERNAL_ERROR'));
            } finally {
                setPending(false);
            }
        },
        [navigate, notify, t],
    );
    return { copy, pending };
}
