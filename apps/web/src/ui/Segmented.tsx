interface SegmentedProps<T extends string> {
    value: T;
    options: readonly { value: T; label: string }[];
    onChange: (v: T) => void;
    label: string;
    small?: boolean;
}

export function Segmented<T extends string>({ value, options, onChange, label, small }: SegmentedProps<T>) {
    return (
        <div className={small ? 'seg seg-sm' : 'seg'} role="group" aria-label={label}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    className={o.value === value ? 'on' : undefined}
                    aria-pressed={o.value === value}
                    onClick={() => {
                        onChange(o.value);
                    }}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
