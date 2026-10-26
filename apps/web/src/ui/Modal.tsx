import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
    title: string;
    onClose: () => void;
    children: ReactNode;
    actions: ReactNode;
}

const FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

export function Modal({ title, onClose, children, actions }: ModalProps) {
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
        (first ?? dialog).focus();

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (e.key !== 'Tab') return;
            const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
            const head = items[0];
            const tail = items[items.length - 1];
            if (!head || !tail) {
                e.preventDefault();
                return;
            }
            if (e.shiftKey && document.activeElement === head) {
                e.preventDefault();
                tail.focus();
            } else if (!e.shiftKey && document.activeElement === tail) {
                e.preventDefault();
                head.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            previous?.focus();
        };
    }, []);

    return (
        <div className="scrim" onMouseDown={onClose}>
            <div
                ref={dialogRef}
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
            >
                <h2 id={titleId} className="display modal-title">
                    {title}
                </h2>
                <div className="modal-body">{children}</div>
                <div className="modal-actions">{actions}</div>
            </div>
        </div>
    );
}
