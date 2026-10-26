import type { PlayerView } from '@quizpulse/protocol';
import { useI18n } from '../../../i18n/i18n';
import { AnswerSlot } from '../../../ui/AnswerSlot';
import { chosenTile, formatAnswerNumber } from '../playerScreen';

/** The answer is in: the chosen tile or number from `myAnswer` (none when the server does not know it). */
export function AcceptedScreen({ view }: { view: PlayerView }) {
    const { t, lang } = useI18n();
    const a = view.myAnswer;
    const tile = chosenTile(view.question, a, t.play.optionTrue, t.play.optionFalse);
    return (
        <div className="play-center">
            <div className="play-icon play-icon-lg play-icon-accent">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    aria-hidden="true"
                >
                    <path d="M5 12l5 5 9-10" />
                </svg>
            </div>
            <h1 className="display play-title">{t.play.accepted}</h1>
            {tile && (
                <div className="play-chosen">
                    <AnswerSlot index={tile.slot} label={tile.label} size="play" />
                </div>
            )}
            {a?.kind === 'numeric' && (
                <div className="card display tnum play-chosen-number">{formatAnswerNumber(lang, a.value)}</div>
            )}
            <p className="muted play-text">{t.play.acceptedSub}</p>
        </div>
    );
}
