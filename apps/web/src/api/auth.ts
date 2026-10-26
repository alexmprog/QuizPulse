import { api, apiResponse, setCsrfToken, type Schemas } from './client';

async function start(path: string, credentials: Schemas['Credentials']): Promise<Schemas['Me']> {
    const { data, headers } = await apiResponse('POST', path, credentials);
    // The session id changed, so the token fetched before is dead; the rotated one comes in the header.
    setCsrfToken(headers.get('X-CSRF-Token'));
    return data as Schemas['Me'];
}

export const authApi = {
    me: () => api<Schemas['Me']>('GET', '/api/v1/auth/me'),
    login: (c: Schemas['Credentials']) => start('/api/v1/auth/login', c),
    register: (c: Schemas['Credentials']) => start('/api/v1/auth/register', c),
    logout: async (): Promise<void> => {
        await api<undefined>('POST', '/api/v1/auth/logout');
        setCsrfToken(null);
    },
};
