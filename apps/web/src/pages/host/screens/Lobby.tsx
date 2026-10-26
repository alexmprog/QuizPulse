import { MAX_PLAYERS, type HostView } from '@quizpulse/protocol';
import { create } from 'qrcode';
import { useMemo } from 'react';
import { useI18n } from '../../../i18n/i18n';
import { formatPin, isLocalJoinUrl, joinAddress } from '../hostScreen';

/** The quiet zone the QR spec asks for around the code, in modules. */
const QR_QUIET_MODULES = 4;

/**
 * One SVG path of the dark modules on a white square that includes the 4-module quiet zone, so the code scans
 * the same in both themes (the design wants black on white whatever the theme).
 */
function QrCode({ text, label, small }: { text: string; label: string; small: boolean }) {
    const { size, d } = useMemo(() => {
        const m = create(text, { errorCorrectionLevel: 'M' }).modules;
        let path = '';
        for (let r = 0; r < m.size; r++) {
            for (let c = 0; c < m.size; c++) if (m.get(r, c)) path += `M${String(c)} ${String(r)}h1v1h-1z`;
        }
        return { size: m.size, d: path };
    }, [text]);
    const q = QR_QUIET_MODULES;
    const full = String(size + 2 * q);
    return (
        <div className={small ? 'host-qr-box host-qr-box-sm' : 'host-qr-box'}>
            <svg
                className="host-qr"
                viewBox={`${String(-q)} ${String(-q)} ${full} ${full}`}
                role="img"
                aria-label={label}
                shapeRendering="crispEdges"
            >
                <rect x={-q} y={-q} width={full} height={full} fill="#ffffff" />
                <path d={d} fill="#000000" />
            </svg>
        </div>
    );
}

function OfflineIcon() {
    return (
        <svg
            className="host-chip-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
        >
            <path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.3-1.7M12 20h.01" />
        </svg>
    );
}

interface LobbyProps {
    view: HostView;
    disabled: boolean;
    onKick: (playerId: string, nickname: string) => void;
}

export function Lobby({ view, disabled, onKick }: LobbyProps) {
    const { t } = useI18n();
    const empty = view.players.length === 0;
    // A localhost link gets a warning under it; the QR gives up the room so the card still fits.
    const local = isLocalJoinUrl(view.joinUrl);
    return (
        <div className="host-lobby">
            <section className="card host-join">
                <QrCode text={view.joinUrl} label={t.host.qr} small={local} />
                <div className="muted host-join-scan">
                    {t.host.scan}
                    <br />
                    <b className="tnum host-join-url">{joinAddress(view.joinUrl)}</b>
                </div>
                {local && <p className="host-join-warn">{t.host.localJoinUrl}</p>}
                <div className="host-pin-label muted">{t.host.pinLabel}</div>
                <div className="display tnum host-pin">{formatPin(view.pin)}</div>
            </section>
            <section className="host-players">
                <div className="row-c host-players-head">
                    <h2 className="display">{t.host.players}</h2>
                    <span className="badge tnum host-badge">
                        {t.host.playersCount(view.players.length, MAX_PLAYERS)}
                    </span>
                </div>
                {empty ? (
                    <div className="host-waiting">
                        <div className="spinner" aria-hidden="true" />
                        <div className="display host-waiting-title">{t.host.waiting}</div>
                        <div className="host-waiting-sub">{t.host.waitingSub}</div>
                    </div>
                ) : (
                    <>
                        <ul className="host-chips">
                            {view.players.map((p) => (
                                <li key={p.id} className={p.connected ? 'pchip' : 'pchip off'}>
                                    {!p.connected && <OfflineIcon />}
                                    <span className="host-chip-nick">{p.nickname}</span>
                                    <button
                                        type="button"
                                        className="x"
                                        aria-label={t.host.kick(p.nickname)}
                                        disabled={disabled}
                                        onClick={() => {
                                            onKick(p.id, p.nickname);
                                        }}
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            aria-hidden="true"
                                        >
                                            <path d="M6 6l12 12M18 6L6 18" />
                                        </svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <div className="row-c host-legend">
                            <span className="row-c host-legend-item">
                                <span className="dot host-dot-online" aria-hidden="true" />
                                {t.host.online}
                            </span>
                            <span className="row-c host-legend-item">
                                <span className="dot host-dot-offline" aria-hidden="true" />
                                {t.host.offline}
                            </span>
                            <span>{t.host.kickHint}</span>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
