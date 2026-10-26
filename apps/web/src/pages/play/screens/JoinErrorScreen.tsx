import { MAX_PLAYERS } from '@quizpulse/protocol';
import { useI18n } from '../../../i18n/i18n';
import { Button } from '../../../ui/Button';

export type JoinRefusal = 'GAME_ALREADY_STARTED' | 'GAME_FULL';

/** A game that cannot take the player: already started or full. */
export function JoinErrorScreen({ code, onOtherPin }: { code: JoinRefusal; onOtherPin: () => void }) {
    const { t } = useI18n();
    const started = code === 'GAME_ALREADY_STARTED';
    return (
        <>
            <div className="play-center">
                <div
                    className={
                        started ? 'play-icon play-icon-md play-icon-warning' : 'play-icon play-icon-md play-icon-danger'
                    }
                >
                    {started ? (
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            aria-hidden="true"
                        >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
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
                            <circle cx="9" cy="8" r="3.5" />
                            <path d="M3 20a6 6 0 0 1 12 0M16 4a3.5 3.5 0 0 1 0 7M21 20a6 6 0 0 0-3.5-5.5" />
                        </svg>
                    )}
                </div>
                <h1 className="display play-title-sm">{started ? t.play.startedTitle : t.play.fullTitle}</h1>
                <p className="muted play-text">{started ? t.play.startedBody : t.play.fullBody(MAX_PLAYERS)}</p>
            </div>
            <Button variant="ghost" size="lg" block onClick={onOtherPin}>
                {t.play.otherPin}
            </Button>
        </>
    );
}
