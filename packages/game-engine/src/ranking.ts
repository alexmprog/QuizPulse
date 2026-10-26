export interface RankInput {
    playerId: string;
    nickname: string;
    score: number;
    correctMs: number;
    joinedAt: number;
}

/** Sort by score desc, correctMs asc, joinedAt asc; ranks are 1..n with no shared places. */
export function rankPlayers(players: RankInput[]): (RankInput & { rank: number })[] {
    return [...players]
        .sort((a, b) => b.score - a.score || a.correctMs - b.correctMs || a.joinedAt - b.joinedAt)
        .map((p, i) => ({ ...p, rank: i + 1 }));
}
