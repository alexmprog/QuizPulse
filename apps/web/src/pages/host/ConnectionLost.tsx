import { useI18n } from '../../i18n/i18n';

/** Dims the last screen while the host socket reconnects. */
export function ConnectionLost() {
    const { t } = useI18n();
    return (
        <div className="scrim host-lost">
            <div className="modal host-lost-card" role="status">
                <div className="spinner host-lost-spinner" aria-hidden="true" />
                <h2 className="display host-lost-title">{t.host.lostTitle}</h2>
                <p className="muted host-lost-text">{t.host.lostText}</p>
                <span className="badge badge-warning host-badge">
                    <span className="dot" aria-hidden="true" />
                    {t.host.lostBadge}
                </span>
            </div>
        </div>
    );
}
