import type { HostView } from '@quizpulse/protocol';
import { useCountdown } from '../../../game/useCountdown';
import { useI18n } from '../../../i18n/i18n';
import { answeredOf, onlineCount } from '../hostScreen';

function PauseIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
    );
}

/** A paused game: the question and its options are hidden. */
export function PauseScreen({ view }: { view: HostView }) {
    const { t } = useI18n();
    const left = useCountdown(view.countdown, null);
    const away = view.pause?.reason === 'host_disconnected';
    const { answered, total } = answeredOf(view);
    return (
        <div className="host-pause">
            <div className={away ? 'host-pause-icon host-pause-icon-warning' : 'host-pause-icon'}>
                <PauseIcon />
            </div>
            <h2 className="display host-pause-title">{away ? t.host.hostAwayTitle : t.host.paused}</h2>
            <p className="host-pause-sub">{away ? t.host.hostAwaySub : t.host.pausedSub}</p>
            <div className="row-c host-pause-badges">
                {left && <span className="badge tnum host-badge-lg">{t.host.pausedLeft(left.seconds)}</span>}
                <span className="badge tnum host-badge-lg">
                    {away
                        ? t.host.onlineOf(onlineCount(view.players), view.players.length)
                        : t.host.answeredOf(answered, total)}
                </span>
            </div>
        </div>
    );
}
