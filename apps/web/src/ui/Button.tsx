import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'danger-ghost';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    block?: boolean;
}

export function Button({ variant = 'default', size = 'md', block, className, type = 'button', ...rest }: ButtonProps) {
    const cls = [
        'btn',
        variant !== 'default' && `btn-${variant}`,
        size !== 'md' && `btn-${size}`,
        block && 'btn-block',
        className,
    ]
        .filter(Boolean)
        .join(' ');
    return <button type={type} className={cls} {...rest} />;
}
