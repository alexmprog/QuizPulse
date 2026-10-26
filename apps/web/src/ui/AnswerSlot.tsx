export const SLOT_SHAPES = ['tri', 'dia', 'cir', 'sq'] as const;
const SLOT_CLASSES = ['opt-a', 'opt-b', 'opt-c', 'opt-d'] as const;
/** Visual slots for true/false: «True» is slot B (blue diamond), «False» is slot A (red triangle). */
export const TRUE_SLOT = 1;
export const FALSE_SLOT = 0;

interface AnswerSlotProps {
    index: number;
    label: string;
    size: 'host' | 'play' | 'chip';
    dim?: boolean;
    correct?: boolean;
    as?: 'div' | 'button';
    onClick?: () => void;
    disabled?: boolean;
}

export function AnswerSlot({ index, label, size, dim, correct, as = 'div', onClick, disabled }: AnswerSlotProps) {
    const slot = ((index % 4) + 4) % 4;
    const className = ['opt', SLOT_CLASSES[slot], `opt-${size}`, dim ? 'opt-dim' : '', correct ? 'opt-correct' : '']
        .filter(Boolean)
        .join(' ');
    const content = (
        <>
            <span className={`shape ${SLOT_SHAPES[slot] ?? 'tri'}`} aria-hidden="true" />
            <span className="opt-label">{label}</span>
        </>
    );
    if (as === 'button') {
        return (
            <button type="button" className={className} onClick={onClick} disabled={disabled}>
                {content}
            </button>
        );
    }
    return <div className={className}>{content}</div>;
}
