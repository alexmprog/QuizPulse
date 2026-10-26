import type { HostView, LeaderboardEntry } from '@quizpulse/protocol';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { GameSocket } from '../../game/socket';
import { useHostGame, type HostCommand } from '../../game/useHostGame';
import { errorText } from '../../i18n/errors';
import { useI18n } from '../../i18n/i18n';
import { Badge } from '../../ui/Badge';
import { PrefsSwitch } from '../../ui/PrefsSwitch';
import { Spinner } from '../../ui/Spinner';
import { useToast } from '../../ui/Toast';
import { ConnectionLost } from './ConnectionLost';
import { ControlBar } from './ControlBar';
import { EndGameDialog } from './EndGameDialog';
import { HostFrame } from './HostFrame';
import { formatPin, hostScreen, type HostScreen } from './hostScreen';
import { FinalScreen } from './screens/FinalScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { Lobby } from './screens/Lobby';
import { PauseScreen } from './screens/PauseScreen';
import { QuestionScreen } from './screens/QuestionScreen';
import { ResultsScreen } from './screens/ResultsScreen';

/** Final standings: the server leaderboard, or the players by score when it is missing. */
function standings(v: HostView): LeaderboardEntry[] {
    if (v.leaderboard) return v.leaderboard;
    const sorted = [...v.players].sort((a, b) => b.score - a.score);
    return sorted.map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        score: p.score,
        rank: sorted.findIndex((q) => q.score === p.score) + 1,
    }));
}

function Header({ view, screen }: { view: HostView; screen: HostScreen }) {
    const { t } = useI18n();
    const n = view.questionIndex + 1;
    if (screen === 'lobby') return <span className="muted host-head-title">{view.quizTitle}</span>;
    if (screen === 'final') {
        return view.outcome === 'aborted' ? (
            <>
                <Badge tone="warning">
                    <span className="dot" aria-hidden="true" />
                    {t.host.aborted}
                </Badge>
                <span className="muted host-head-note">{t.host.abortedNote(n, view.questionCount)}</span>
            </>
        ) : (
            <Badge tone="success">
                <span className="dot" aria-hidden="true" />
                {t.host.completed}
            </Badge>
        );
    }
    if (screen === 'leaderboard') {
        return <span className="badge tnum host-badge">{t.host.afterQuestion(n, view.questionCount)}</span>;
    }
    const multiplier = view.question?.multiplier ?? 1;
    return (
        <>
            <span className="badge tnum host-badge">{t.host.questionOf(n, view.questionCount)}</span>
            {multiplier > 1 && <span className="badge badge-accent host-badge">{t.host.multiplier(multiplier)}</span>}
        </>
    );
}

function Screen({
    view,
    screen,
    busy,
    showTable,
    onKick,
}: {
    view: HostView;
    screen: HostScreen;
    busy: boolean;
    showTable: boolean;
    onKick: (playerId: string, nickname: string) => void;
}) {
    switch (screen) {
        case 'lobby':
            return <Lobby view={view} disabled={busy} onKick={onKick} />;
        case 'question':
            return view.question && <QuestionScreen view={view} question={view.question} />;
        case 'pause':
            return <PauseScreen view={view} />;
        case 'results':
            return view.question && view.results && <ResultsScreen question={view.question} results={view.results} />;
        case 'leaderboard':
            return <LeaderboardScreen entries={view.leaderboard ?? []} />;
        case 'final':
            return <FinalScreen entries={standings(view)} quizTitle={view.quizTitle} showTable={showTable} />;
    }
}

function NotFound() {
    const { t } = useI18n();
    return (
        <main className="page">
            <h1 className="display">{t.host.notFoundTitle}</h1>
            <p className="muted">{t.host.notFoundText}</p>
            <Link className="link" to="/studio">
                {t.host.toStudio}
            </Link>
        </main>
    );
}

/** `/host/:gameId`: the host's big screen. Mounted under `RequireAuth`. */
export function HostPage({ socketFactory }: { socketFactory?: () => GameSocket }) {
    const { gameId = '' } = useParams();
    const game = useHostGame(gameId, socketFactory);
    const { t } = useI18n();
    const notify = useToast();
    const navigate = useNavigate();
    const [dialog, setDialog] = useState<'end' | 'close' | null>(null);
    const [showTable, setShowTable] = useState(false);
    const [leaving, setLeaving] = useState(false);

    const { view, conn, fatal, pending } = game;
    const offline = conn !== 'online';
    const busy = pending || offline;

    // One redirect for both ways out of a closed lobby: our own `host:end` ack and the server's `game:closed`.
    if (leaving || fatal === 'closed') return <Navigate to="/studio" replace />;
    if (fatal === 'UNAUTHENTICATED') {
        return <Navigate to={`/login?next=${encodeURIComponent(`/host/${gameId}`).replace(/%2F/g, '/')}`} replace />;
    }
    if (fatal) return <NotFound />;

    if (!view) {
        return (
            <div className="host-root">
                <div className="host-stage host-loading">
                    <Spinner label={t.common.loading} />
                </div>
                {conn === 'reconnecting' && <ConnectionLost />}
            </div>
        );
    }

    const screen = hostScreen(view);
    // A dialog left open across a phase change that makes it pointless (lobby closed, game finished) disappears.
    const dialogFits = dialog === 'close' ? screen === 'lobby' : screen !== 'lobby' && screen !== 'final';

    const send = async (c: HostCommand): Promise<boolean> => {
        const code = await game.command(c);
        if (code) notify(errorText(t, code));
        return code === null;
    };
    const onCommand = (c: HostCommand) => {
        void send(c);
    };
    const onKick = (playerId: string, nickname: string) => {
        void game.kick(playerId).then((code) => {
            notify(code ? errorText(t, code) : t.host.kicked(nickname));
        });
    };
    const onConfirmEnd = () => {
        const kind = dialog;
        void send('host:end').then((ok) => {
            setDialog(null);
            if (ok && kind === 'close') setLeaving(true);
        });
    };

    return (
        <div className="host-root">
            <HostFrame
                header={<Header view={view} screen={screen} />}
                headerEnd={
                    screen === 'lobby' ? (
                        <PrefsSwitch />
                    ) : screen === 'final' ? null : (
                        <span className="muted tnum host-head-pin">{t.host.pin(formatPin(view.pin))}</span>
                    )
                }
                controls={
                    <ControlBar
                        screen={screen}
                        view={view}
                        busy={busy}
                        offline={offline}
                        showTable={showTable}
                        onCommand={onCommand}
                        onEndEarly={() => {
                            setDialog('end');
                        }}
                        onCloseLobby={() => {
                            setDialog('close');
                        }}
                        onToggleTable={() => {
                            setShowTable((s) => !s);
                        }}
                        onStudio={() => {
                            void navigate('/studio');
                        }}
                    />
                }
            >
                <Screen view={view} screen={screen} busy={busy} showTable={showTable} onKick={onKick} />
            </HostFrame>
            {dialog && dialogFits && (
                <EndGameDialog
                    kind={dialog}
                    disabled={busy}
                    onConfirm={onConfirmEnd}
                    onCancel={() => {
                        setDialog(null);
                    }}
                />
            )}
            {conn === 'reconnecting' && <ConnectionLost />}
        </div>
    );
}
