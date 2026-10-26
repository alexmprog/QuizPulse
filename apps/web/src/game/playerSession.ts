const KEY = 'qp.player';

/** What a player needs to get back into a game after a reload: the join ack plus the PIN it was for. */
export interface PlayerSession {
    pin: string;
    gameId: string;
    playerId: string;
    playerToken: string;
}

export function loadSession(): PlayerSession | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw === null) return null;
        const v = JSON.parse(raw) as Partial<Record<keyof PlayerSession, unknown>> | null;
        if (
            typeof v?.pin !== 'string' ||
            typeof v.gameId !== 'string' ||
            typeof v.playerId !== 'string' ||
            typeof v.playerToken !== 'string'
        ) {
            return null;
        }
        return { pin: v.pin, gameId: v.gameId, playerId: v.playerId, playerToken: v.playerToken };
    } catch {
        return null;
    }
}

export function saveSession(s: PlayerSession): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
        /* storage unavailable: the player just cannot resume after a reload */
    }
}

export function clearSession(): void {
    try {
        localStorage.removeItem(KEY);
    } catch {
        /* storage unavailable */
    }
}
