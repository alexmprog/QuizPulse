import type { ReactNode } from 'react';
import { Logo } from '../../ui/Logo';

interface HostFrameProps {
    /** Header content after the logo (question badge, multiplier, outcome…). */
    header: ReactNode;
    /** Header content pinned to the right (PIN, or the prefs switch in the lobby). */
    headerEnd?: ReactNode;
    /** The control panel at the bottom. */
    controls: ReactNode;
    children: ReactNode;
}

/** The 1280×720 big-screen frame: 64-unit header, main area, 80-unit control panel; scaled by `--u`. */
export function HostFrame({ header, headerEnd, controls, children }: HostFrameProps) {
    return (
        <div className="host-stage">
            <div className="host-frame">
                <header className="host-head">
                    <Logo />
                    {header}
                    {headerEnd && <span className="host-head-end">{headerEnd}</span>}
                </header>
                <main className="host-main">{children}</main>
                {controls}
            </div>
        </div>
    );
}
