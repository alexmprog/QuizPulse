import { HOST_ABSENT_MS, type Countdown, type HostView } from '@quizpulse/protocol';
import type { ReactNode } from 'react';
import type { HostCommand } from '../../game/useHostGame';
import { useCountdown } from '../../game/useCountdown';
import { useI18n } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import type { HostScreen } from './hostScreen';

function AutoAdvance({ countdown }: { countdown: Countdown }) {
    const { t } = useI18n();
    const left = useCountdown(countdown, null);
    if (!left) return null;
    return (
        <div className="host-auto">
            <span className="host-auto-text">{t.host.autoNext(left.seconds)}</span>
            <div className="bar host-auto-bar">
                <i style={{ width: `${String(left.fraction * 100)}%` }} />
            </div>
        </div>
    );
}

function PlayIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 4.5v15l13-7.5z" />
        </svg>
    );
}

function PauseIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
    );
}

function Hint({ children }: { children: ReactNode }) {
    return <span className="muted host-bar-hint">{children}</span>;
}

interface ControlBarProps {
    screen: HostScreen;
    view: HostView;
    /** Command buttons are off: a command is waiting for its ack, or the socket is not online. */
    busy: boolean;
    /** The socket is not online: every button is off. */
    offline: boolean;
    showTable: boolean;
    onCommand: (c: HostCommand) => void;
    onEndEarly: () => void;
    onCloseLobby: () => void;
    onToggleTable: () => void;
    onStudio: () => void;
}

/** The 80-unit control panel; its buttons follow the screen table in `docs/design.md`. */
export function ControlBar(props: ControlBarProps) {
    const { screen, view, busy, offline, showTable, onCommand, onEndEarly, onCloseLobby, onToggleTable, onStudio } =
        props;
    const { t } = useI18n();
    const endEarly = (
        <Button variant="danger-ghost" size="lg" className="host-bar-push" disabled={busy} onClick={onEndEarly}>
            {t.host.endEarly}
        </Button>
    );
    const pause = (
        <Button
            size="lg"
            disabled={busy}
            onClick={() => {
                onCommand('host:pause');
            }}
        >
            <PauseIcon />
            {t.host.pause}
        </Button>
    );
    const next = (label: string) => (
        <Button
            variant="primary"
            size="xl"
            disabled={busy}
            onClick={() => {
                onCommand('host:next');
            }}
        >
            {label}
        </Button>
    );
    const auto = view.autoAdvance && <AutoAdvance countdown={view.autoAdvance} />;

    let content: ReactNode;
    switch (screen) {
        case 'lobby':
            content = (
                <>
                    <Hint>{view.players.length === 0 ? t.host.footEmpty : t.host.footReady}</Hint>
                    <Button variant="ghost" size="lg" className="host-bar-push" disabled={busy} onClick={onCloseLobby}>
                        {t.host.closeGame}
                    </Button>
                    <Button
                        variant="primary"
                        size="xl"
                        disabled={busy || view.players.length === 0}
                        onClick={() => {
                            onCommand('host:start');
                        }}
                    >
                        <PlayIcon />
                        {t.host.start}
                    </Button>
                </>
            );
            break;
        case 'question':
            content = (
                <>
                    <Hint>{view.quizTitle}</Hint>
                    {endEarly}
                    {pause}
                </>
            );
            break;
        case 'pause':
            content = (
                <>
                    <Hint>
                        {view.pause?.reason === 'host_disconnected'
                            ? t.host.autoEnd(Math.round(HOST_ABSENT_MS / 60_000))
                            : view.quizTitle}
                    </Hint>
                    {endEarly}
                    <Button
                        variant="primary"
                        size="xl"
                        disabled={busy}
                        onClick={() => {
                            onCommand('host:resume');
                        }}
                    >
                        <PlayIcon />
                        {t.host.resume}
                    </Button>
                </>
            );
            break;
        case 'results':
            content = (
                <>
                    {auto}
                    {endEarly}
                    {pause}
                    {next(t.host.next)}
                </>
            );
            break;
        case 'leaderboard': {
            const last = view.questionIndex + 1 >= view.questionCount;
            content = (
                <>
                    {auto ?? <Hint>{t.host.leaderboardHint(view.players.length)}</Hint>}
                    {endEarly}
                    {pause}
                    {next(last ? t.host.toFinal : t.host.nextQuestion(view.questionIndex + 2))}
                </>
            );
            break;
        }
        case 'final': {
            const studio = (primary: boolean) => (
                <Button
                    variant={primary ? 'primary' : 'ghost'}
                    size={primary ? 'xl' : 'lg'}
                    className={primary ? undefined : 'host-bar-push'}
                    disabled={offline}
                    onClick={onStudio}
                >
                    {t.host.toStudio}
                </Button>
            );
            const toggle = (primary: boolean) => (
                <Button
                    variant={primary ? 'primary' : 'ghost'}
                    size={primary ? 'xl' : 'lg'}
                    className={primary ? undefined : 'host-bar-push'}
                    disabled={offline}
                    onClick={onToggleTable}
                >
                    {showTable ? t.host.podium : t.host.fullTable}
                </Button>
            );
            content = (
                <>
                    <Hint>{view.outcome === 'aborted' ? t.host.savedAborted : t.host.saved}</Hint>
                    {showTable ? toggle(false) : studio(false)}
                    {showTable ? studio(true) : toggle(true)}
                </>
            );
            break;
        }
    }
    return <footer className="host-bar">{content}</footer>;
}
