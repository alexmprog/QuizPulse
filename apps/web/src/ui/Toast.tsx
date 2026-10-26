import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastAction {
    label: string;
    onClick: () => void;
}
type Notify = (text: string, action?: ToastAction) => void;

const TOAST_MS = 5000;
const ToastContext = createContext<Notify | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toast, setToast] = useState<{ id: number; text: string; action?: ToastAction } | null>(null);
    const nextId = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const notify = useCallback<Notify>((text, action) => {
        clearTimeout(timer.current);
        nextId.current += 1;
        setToast({ id: nextId.current, text, action });
        timer.current = setTimeout(() => {
            setToast(null);
        }, TOAST_MS);
    }, []);

    useEffect(
        () => () => {
            clearTimeout(timer.current);
        },
        [],
    );

    return (
        <ToastContext.Provider value={notify}>
            {children}
            <div className="toast-region" role="status" aria-live="polite">
                {toast && (
                    <div className="toast" key={toast.id}>
                        <span>{toast.text}</span>
                        {toast.action && (
                            <button
                                type="button"
                                className="toast-action"
                                onClick={() => {
                                    toast.action?.onClick();
                                    setToast(null);
                                }}
                            >
                                {toast.action.label}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): Notify {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside ToastProvider');
    return ctx;
}
