import type { PauseView } from '@quizpulse/protocol';
import { useI18n } from '../../../i18n/i18n';

/** A paused game: no answer buttons; the reason decides between the host's pause and a lost host screen. */
export function PauseScreen({ reason }: { reason: PauseView['reason'] }) {
    const { t } = useI18n();
    const away = reason === 'host_disconnected';
    return (
        <div className="play-center">
            <div
                className={
                    away ? 'play-icon play-icon-lg play-icon-warning' : 'play-icon play-icon-lg play-icon-accent-soft'
                }
            >
                {away ? (
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        aria-hidden="true"
                    >
                        <rect x="3" y="4" width="18" height="12" rx="2" />
                        <path d="M8 20h8M12 16v4M3 3l18 18" />
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                )}
            </div>
            <h1 className="display play-title">{away ? t.play.hostGone : t.play.paused}</h1>
            <p className="muted play-text play-narrow">{away ? t.play.hostGoneSub : t.play.pausedSub}</p>
        </div>
    );
}
