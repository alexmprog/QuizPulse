import { api, type Schemas } from './client';

export const historyApi = {
    list: () => api<Schemas['GameSummary'][]>('GET', '/api/v1/history'),
    get: (gameId: string) => api<Schemas['GameDetail']>('GET', `/api/v1/history/${gameId}`),
};

/**
 * Headline numbers of a finished game. `playedQuestions` counts questions with at least one answer;
 * `correctShare` is correct answers over all answers (0..1), `null` when nobody answered.
 */
export function gameStats(d: Schemas['GameDetail']): {
    players: number;
    playedQuestions: number;
    correctShare: number | null;
} {
    let answers = 0;
    let correct = 0;
    let playedQuestions = 0;
    for (const q of d.questions) {
        if (q.answers.length > 0) playedQuestions += 1;
        answers += q.answers.length;
        correct += q.answers.filter((a) => a.correct).length;
    }
    return { players: d.players.length, playedQuestions, correctShare: answers === 0 ? null : correct / answers };
}
