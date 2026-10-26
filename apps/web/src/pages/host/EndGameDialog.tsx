import { useI18n } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';

interface EndGameDialogProps {
    /** `end`: finish a running game early (outcome «aborted»); `close`: close the lobby. */
    kind: 'end' | 'close';
    disabled: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

/** Confirmation before `host:end`. */
export function EndGameDialog({ kind, disabled, onConfirm, onCancel }: EndGameDialogProps) {
    const { t } = useI18n();
    const close = kind === 'close';
    return (
        <Modal
            title={close ? t.host.closeTitle : t.host.endTitle}
            onClose={onCancel}
            actions={
                <>
                    <Button variant="ghost" size="lg" onClick={onCancel}>
                        {close ? t.common.cancel : t.host.keepPlaying}
                    </Button>
                    <Button variant="danger" size="lg" disabled={disabled} onClick={onConfirm}>
                        {close ? t.host.closeGame : t.host.endConfirm}
                    </Button>
                </>
            }
        >
            <p className="muted host-dialog-text">{close ? t.host.closeText : t.host.endText}</p>
        </Modal>
    );
}
