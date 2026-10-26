import { useId, type InputHTMLAttributes } from 'react';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
    label: string;
    hint?: string;
    error?: string;
    large?: boolean;
}

export function Field({ label, hint, error, large, className, ...input }: FieldProps) {
    const id = useId();
    const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
    return (
        <div className="field">
            <label className="label" htmlFor={id}>
                {label}
            </label>
            <input
                id={id}
                className={['input', large && 'input-lg', error && 'invalid', className].filter(Boolean).join(' ')}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                {...input}
            />
            {error ? (
                <span id={`${id}-err`} className="err" role="alert">
                    {error}
                </span>
            ) : hint ? (
                <span id={`${id}-hint`} className="hint">
                    {hint}
                </span>
            ) : null}
        </div>
    );
}
