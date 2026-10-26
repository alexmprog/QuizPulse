import type { PlayerView } from '@quizpulse/protocol';
import { useI18n } from '../../../i18n/i18n';
import { formatPin } from '../../host/hostScreen';

/** Joined, waiting for the host to start. `pin` is the link's PIN when there is one. */
export function LobbyScreen({ view, pin }: { view: PlayerView; pin: string | null }) {
    const { t } = useI18n();
    const initial = (Array.from(view.me.nickname)[0] ?? '?').toUpperCase();
    return (
        <>
            <div className="play-center">
                <span className="avatar play-avatar" aria-hidden="true">
                    {initial}
                </span>
                <div className="display play-lobby-nick">{view.me.nickname}</div>
                <span className="badge badge-success play-badge-lg">
                    <span className="dot" aria-hidden="true" />
                    {t.play.inGame}
                </span>
                <p className="muted play-text play-narrow">{t.play.waitHost}</p>
            </div>
            <div className="card play-game-card play-game-card-center">
                <span className="muted tnum play-game-pin">{pin ? t.play.gamePin(formatPin(pin)) : t.play.game}</span>
                <span className="play-game-title">{view.quizTitle}</span>
            </div>
        </>
    );
}
