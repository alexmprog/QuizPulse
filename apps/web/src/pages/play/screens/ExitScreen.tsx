import type { PlayerExit } from '../../../game/usePlayerGame';
import { useI18n } from '../../../i18n/i18n';
import { Button } from '../../../ui/Button';

/** Out of the game: removed by the host or the game is closed. «Enter a PIN» starts over. */
export function ExitScreen({ kind, onEnterPin }: { kind: PlayerExit; onEnterPin: () => void }) {
    const { t } = useI18n();
    const kicked = kind === 'kicked';
    return (
        <>
            <div className="play-center">
                <div
                    className={
                        kicked ? 'play-icon play-icon-md play-icon-danger' : 'play-icon play-icon-md play-icon-neutral'
                    }
                >
                    {kicked ? (
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            aria-hidden="true"
                        >
                            <circle cx="10" cy="8" r="4" />
                            <path d="M3 21a7 7 0 0 1 12-4.9M17 15l4 4M21 15l-4 4" />
                        </svg>
                    ) : (
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            aria-hidden="true"
                        >
                            <rect x="5" y="11" width="14" height="10" rx="2" />
                            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                        </svg>
                    )}
                </div>
                <h1 className="display play-title-sm">{kicked ? t.play.kicked : t.play.closed}</h1>
                <p className="muted play-text">{kicked ? t.play.kickedSub : t.play.closedSub}</p>
            </div>
            <Button variant="primary" size="lg" block onClick={onEnterPin}>
                {t.play.enterPin}
            </Button>
        </>
    );
}
