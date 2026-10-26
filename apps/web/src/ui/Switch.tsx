interface SwitchProps {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            className={checked ? 'switch on' : 'switch'}
            disabled={disabled}
            onClick={() => {
                onChange(!checked);
            }}
        />
    );
}
