import { pinSchema, type ErrorCode, type PlayerView } from '@quizpulse/protocol';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { GameSocket } from '../../game/socket';
import { usePlayerGame, type PlayerGame } from '../../game/usePlayerGame';
import { errorText } from '../../i18n/errors';
import { useI18n } from '../../i18n/i18n';
import { Badge } from '../../ui/Badge';
import { Logo } from '../../ui/Logo';
import { PrefsSwitch } from '../../ui/PrefsSwitch';
import { Spinner } from '../../ui/Spinner';
import { formatPin } from '../host/hostScreen';
import { PlayHeader } from './PlayHeader';
import { playerScreen, resultTone, type PlayerScreen } from './playerScreen';
import { Reconnecting } from './Reconnecting';
import { AcceptedScreen } from './screens/AcceptedScreen';
import { AnswerScreen } from './screens/AnswerScreen';
import { ExitScreen } from './screens/ExitScreen';
import { FinalScreen } from './screens/FinalScreen';
import { JoinErrorScreen, type JoinRefusal } from './screens/JoinErrorScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { NicknameScreen } from './screens/NicknameScreen';
import { PauseScreen } from './screens/PauseScreen';
import { PinScreen } from './screens/PinScreen';
import { RankScreen } from './screens/RankScreen';
import { ResultScreen } from './screens/ResultScreen';

function isJoinRefusal(code: ErrorCode): code is JoinRefusal {
    return code === 'GAME_ALREADY_STARTED' || code === 'GAME_FULL';
}

/** The top bar of a pre-game screen: the logo, plus the language and theme switch where it belongs. */
function BrandBar({ prefs }: { prefs: boolean }) {
    return (
        <header className="row-c play-brand">
            <Logo />
            {prefs && <PrefsSwitch />}
        </header>
    );
}

/** The in-game header for a screen. */
function GameHeader({ view, screen }: { view: PlayerView; screen: PlayerScreen }) {
    const { t } = useI18n();
    if (screen === 'final') {
        const badge =
            view.outcome === 'aborted' ? (
                <Badge tone="warning">
                    <span className="dot" aria-hidden="true" />
                    {t.play.aborted}
                </Badge>
            ) : (
                <Badge tone="success">
                    <span className="dot" aria-hidden="true" />
                    {t.play.completed}
                </Badge>
            );
        return <PlayHeader view={view} score={false} badge={badge} />;
    }
    const timer = screen === 'answer' || screen === 'accepted';
    const score = timer || screen === 'pause';
    return <PlayHeader view={view} score={score} timer={timer} />;
}

function InGame({
    view,
    screen,
    game,
    onEnterPin,
}: {
    view: PlayerView;
    screen: PlayerScreen;
    game: PlayerGame;
    onEnterPin: () => void;
}) {
    switch (screen) {
        case 'answer':
            return (
                view.question && (
                    <AnswerScreen
                        key={view.questionIndex}
                        question={view.question}
                        answering={game.answering}
                        onAnswer={game.answer}
                    />
                )
            );
        case 'accepted':
            return <AcceptedScreen view={view} />;
        case 'pause':
            return <PauseScreen reason={view.pause?.reason ?? 'host'} />;
        case 'result':
            return <ResultScreen view={view} />;
        case 'rank':
            return <RankScreen view={view} />;
        case 'final':
            return <FinalScreen view={view} onEnterPin={onEnterPin} />;
        default:
            return null;
    }
}

/** What the server said about the PIN: the code and the PIN it was for, rendered in the current language. */
interface PinRefusal {
    code: ErrorCode;
    pin: string;
}

/** A refused nickname step: `NICKNAME_TAKEN` marks the field, any other code is shown under the form. */
interface NickRefusal {
    code: ErrorCode;
    nickname: string;
}

/**
 * `/play`: the player's remote, no sign-in. A PIN, typed or from the `?pin=` of the QR link, is first checked with
 * `lookup`; a typed one then goes into the URL so a reload keeps it. While a saved session is being restored a
 * spinner stands in for the join form.
 */
export function PlayPage({ socketFactory }: { socketFactory?: () => GameSocket }) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const raw = params.get('pin');
    const urlPin = raw !== null && pinSchema.safeParse(raw).success ? raw : null;
    const game = usePlayerGame(urlPin, socketFactory);
    const { view, conn, exit, restoring, lookup } = game;

    const [digits, setDigits] = useState('');
    const [pinRefusal, setPinRefusal] = useState<PinRefusal | null>(null);
    const [found, setFound] = useState<{ pin: string; quizTitle: string } | null>(null);
    const [joinRefusal, setJoinRefusal] = useState<JoinRefusal | null>(null);
    const [nickRefusal, setNickRefusal] = useState<NickRefusal | null>(null);
    const [lookingUp, setLookingUp] = useState(false);
    const [joining, setJoining] = useState(false);
    /** The PIN whose `lookup` from the link is in flight (StrictMode and re-renders must not send it twice). */
    const linkLookup = useRef<string | null>(null);

    // A successful join keeps «Join» off until the first snapshot replaces the form.
    if (view && joining) setJoining(false);

    /** A PIN that leads nowhere: back to the PIN entry (or the join error screen) without `?pin=`. */
    const refusePin = useCallback(
        (pin: string, code: ErrorCode) => {
            setFound(null);
            if (isJoinRefusal(code)) {
                setJoinRefusal(code);
                setDigits('');
                setPinRefusal(null);
            } else {
                setDigits(pin);
                setPinRefusal({ code, pin });
            }
            setParams({}, { replace: true });
        },
        [setParams],
    );

    const linkNeedsLookup =
        urlPin !== null &&
        found?.pin !== urlPin &&
        view === null &&
        exit === null &&
        !restoring &&
        conn === 'online' &&
        joinRefusal === null;

    useEffect(() => {
        if (!linkNeedsLookup || linkLookup.current === urlPin) return;
        const pin = urlPin;
        linkLookup.current = pin;
        void lookup(pin).then((res) => {
            linkLookup.current = null;
            if (typeof res === 'string') refusePin(pin, res);
            else setFound({ pin, quizTitle: res.quizTitle });
        });
    }, [linkNeedsLookup, urlPin, lookup, refusePin]);

    const submitPin = () => {
        const pin = digits;
        setLookingUp(true);
        setPinRefusal(null);
        void lookup(pin).then((res) => {
            setLookingUp(false);
            if (typeof res === 'string') {
                refusePin(pin, res);
                return;
            }
            setFound({ pin, quizTitle: res.quizTitle });
            setParams({ pin }, { replace: true });
        });
    };

    const submitNickname = (pin: string, nickname: string) => {
        setJoining(true);
        setNickRefusal(null);
        void game.join(pin, nickname).then((code) => {
            if (code === null) return;
            setJoining(false);
            if (code === 'GAME_NOT_FOUND' || isJoinRefusal(code)) refusePin(pin, code);
            else setNickRefusal({ code, nickname });
        });
    };

    const startOver = () => {
        setFound(null);
        setDigits('');
        setPinRefusal(null);
        setJoinRefusal(null);
        setNickRefusal(null);
        setJoining(false);
    };

    /** Forgets the game (session, view, exit) and goes back to an empty PIN entry. */
    const enterPin = () => {
        game.leave();
        startOver();
        void navigate('/play', { replace: true });
    };

    const screen = playerScreen(view, { exit, pin: urlPin });
    let top: ReactNode = null;
    let body: ReactNode;
    let tone = '';

    if (exit) {
        top = <BrandBar prefs={false} />;
        body = <ExitScreen kind={exit} onEnterPin={enterPin} />;
    } else if (restoring && !view) {
        body = (
            <div className="play-center">
                <Spinner label={t.common.loading} />
            </div>
        );
    } else if (!view && joinRefusal) {
        top = <BrandBar prefs={false} />;
        body = (
            <JoinErrorScreen
                code={joinRefusal}
                onOtherPin={() => {
                    startOver();
                }}
            />
        );
    } else if (!view) {
        top = <BrandBar prefs />;
        if (screen === 'nickname' && urlPin !== null) {
            body =
                found?.pin === urlPin ? (
                    <NicknameScreen
                        key={urlPin}
                        pin={urlPin}
                        quizTitle={found.quizTitle}
                        busy={joining}
                        taken={nickRefusal?.code === 'NICKNAME_TAKEN' ? nickRefusal.nickname : null}
                        error={
                            nickRefusal && nickRefusal.code !== 'NICKNAME_TAKEN' ? errorText(t, nickRefusal.code) : null
                        }
                        onEdit={() => {
                            setNickRefusal(null);
                        }}
                        onSubmit={(nickname) => {
                            submitNickname(urlPin, nickname);
                        }}
                    />
                ) : (
                    <div className="play-center">
                        <Spinner label={t.common.loading} />
                    </div>
                );
        } else {
            body = (
                <PinScreen
                    digits={digits}
                    busy={lookingUp}
                    error={
                        pinRefusal
                            ? pinRefusal.code === 'GAME_NOT_FOUND'
                                ? t.play.pinNotFound(formatPin(pinRefusal.pin))
                                : errorText(t, pinRefusal.code)
                            : null
                    }
                    onDigits={(d) => {
                        setDigits(d);
                        setPinRefusal(null);
                    }}
                    onSubmit={submitPin}
                />
            );
        }
    } else if (screen === 'lobby') {
        top = <BrandBar prefs />;
        body = <LobbyScreen view={view} pin={urlPin} />;
    } else {
        top = <GameHeader view={view} screen={screen} />;
        body = <InGame view={view} screen={screen} game={game} onEnterPin={enterPin} />;
        if (screen === 'result') tone = ` play-tone-${resultTone(view)}`;
    }

    return (
        <div className={`play${tone}`}>
            <div className="play-col">
                {top}
                <main className="play-main">{body}</main>
            </div>
            {conn === 'reconnecting' && <Reconnecting />}
        </div>
    );
}
