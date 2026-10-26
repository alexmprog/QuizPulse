import { useState } from 'react';
import { Field } from '../../../ui/Field';

interface NumberFieldProps {
    label: string;
    /** `null` is an empty field. */
    value: number | null;
    onChange: (v: number | null) => void;
    error?: string;
    hint?: string;
    /** Allow a fractional part and a minus sign (the correct number of a numeric question). */
    decimal?: boolean;
    disabled?: boolean;
}

const show = (v: number | null) => (v === null || Number.isNaN(v) ? '' : String(v));

function parse(raw: string): number | null {
    const s = raw.trim().replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/** A text input that edits a number; an empty field is `null`, never 0. Keeps what is typed while it is half-written ("-", "1."). */
export function NumberField({ label, value, onChange, error, hint, decimal, disabled }: NumberFieldProps) {
    const [text, setText] = useState(show(value));
    const [emitted, setEmitted] = useState(value);
    if (!Object.is(value, emitted)) {
        // The value changed from outside (another question selected, type switched): show it.
        setEmitted(value);
        setText(show(value));
    }
    return (
        <Field
            label={label}
            value={text}
            inputMode={decimal ? 'decimal' : 'numeric'}
            autoComplete="off"
            disabled={disabled}
            error={error}
            hint={hint}
            onChange={(e) => {
                const raw = e.target.value;
                const v = parse(raw);
                setText(raw);
                setEmitted(v);
                onChange(v);
            }}
        />
    );
}
