import { api, type Schemas } from './client';

export const quizzesApi = {
    list: () => api<Schemas['QuizSummary'][]>('GET', '/api/v1/quizzes'),
    get: (id: string) => api<Schemas['Quiz']>('GET', `/api/v1/quizzes/${id}`),
    create: (q: Schemas['QuizInput']) => api<Schemas['Quiz']>('POST', '/api/v1/quizzes', q),
    replace: (id: string, q: Schemas['QuizInput']) => api<Schemas['Quiz']>('PUT', `/api/v1/quizzes/${id}`, q),
    remove: (id: string) => api<undefined>('DELETE', `/api/v1/quizzes/${id}`),
};
