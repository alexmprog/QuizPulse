/** Trim and collapse inner whitespace. Must agree with `nicknameSchema` in @quizpulse/protocol. */
export function normalizeNickname(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ');
}
