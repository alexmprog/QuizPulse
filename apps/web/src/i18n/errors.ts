import type { ErrorCode } from '@quizpulse/protocol';
import type { Dict } from './i18n';

export function errorText(t: Dict, code: ErrorCode): string {
    return t.errors[code];
}
