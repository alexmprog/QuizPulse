import type { ReactNode } from 'react';

export function Badge({
    tone = 'neutral',
    children,
}: {
    tone?: 'neutral' | 'success' | 'warning' | 'accent' | 'danger';
    children: ReactNode;
}) {
    return <span className={tone === 'neutral' ? 'badge' : `badge badge-${tone}`}>{children}</span>;
}
