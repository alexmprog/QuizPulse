import { useI18n } from '../../i18n/i18n';

/** Dims the current remote screen while the socket reconnects. */
export function Reconnecting() {
    const { t } = useI18n();
    return (
        <div className="scrim">
            <div className="modal play-lost" role="status">
                <div className="spinner" aria-hidden="true" />
                <h2 className="display play-lost-title">{t.play.reconnecting}</h2>
                <p className="muted play-lost-text">{t.play.reconnectingSub}</p>
            </div>
        </div>
    );
}
