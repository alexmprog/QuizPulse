import type { ErrorCode, PlayerAnswer, QuestionPublic } from '@quizpulse/protocol';
import { useId, useState } from 'react';
import { errorText } from '../../../i18n/errors';
import { useI18n } from '../../../i18n/i18n';
import { AnswerSlot } from '../../../ui/AnswerSlot';
import { Button } from '../../../ui/Button';
import { answerTiles } from '../../host/hostScreen';
import { parseDecimal } from '../playerScreen';

function NumericAnswer({ off, onSend }: { off: boolean; onSend: (value: number) => void }) {
    const { t } = useI18n();
    const id = useId();
    const [raw, setRaw] = useState('');
    const value = parseDecimal(raw);
    return (
        <form
            className="play-form play-numeric"
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                if (value !== null && !off) onSend(value);
            }}
        >
            <div className="field">
                <label className="label play-numeric-label" htmlFor={id}>
                    {t.play.yourNumber}
                </label>
                <input
                    id={id}
                    className="input input-lg tnum play-numeric-input"
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint="send"
                    value={raw}
                    onChange={(e) => {
                        setRaw(e.target.value);
                    }}
                />
            </div>
            <Button type="submit" variant="primary" size="lg" block disabled={value === null || off}>
                {t.play.answer}
            </Button>
            <p className="hint play-once">{t.play.once}</p>
        </form>
    );
}

/**
 * The answer buttons of the open question (its text is only on the big screen). Buttons are off while an answer
 * is in flight and after it was accepted; a refusal leaves a quiet note and the next snapshot fixes the screen.
 */
export function AnswerScreen({
    question,
    answering,
    onAnswer,
}: {
    question: QuestionPublic;
    answering: boolean;
    onAnswer: (a: PlayerAnswer) => Promise<ErrorCode | null>;
}) {
    const { t } = useI18n();
    const [sent, setSent] = useState(false);
    const [note, setNote] = useState<ErrorCode | null>(null);
    const off = answering || sent;

    const send = (a: PlayerAnswer) => {
        setNote(null);
        void onAnswer(a).then((code) => {
            if (code) setNote(code);
            else setSent(true);
        });
    };

    return (
        <div className="play-answer">
            <p className="muted play-look">{t.play.lookScreen}</p>
            {question.type === 'numeric' ? (
                <NumericAnswer
                    off={off}
                    onSend={(value) => {
                        send({ kind: 'numeric', value });
                    }}
                />
            ) : (
                <div className={question.type === 'true_false' ? 'play-options play-options-tf' : 'play-options'}>
                    {answerTiles(question, t.play.optionTrue, t.play.optionFalse).map((tile) => (
                        <AnswerSlot
                            key={tile.option}
                            as="button"
                            size="play"
                            index={tile.slot}
                            label={tile.label}
                            disabled={off}
                            onClick={() => {
                                send({ kind: 'option', option: tile.option });
                            }}
                        />
                    ))}
                </div>
            )}
            {note && (
                <p className="muted play-note" role="status">
                    {errorText(t, note)}
                </p>
            )}
        </div>
    );
}
