import { NICKNAME_MAX, nicknameSchema } from '@quizpulse/protocol';
import { useId, useState } from 'react';
import { useI18n } from '../../../i18n/i18n';
import { Button } from '../../../ui/Button';
import { formatPin } from '../../host/hostScreen';
import { normalizeNickname } from '../playerScreen';

/**
 * The nickname step: the game card (quiz title and PIN), the nickname field with its `N / 20` counter and «Join».
 * `taken` marks the field for a nickname the server refused; `error` is any other refusal, shown under the form.
 */
export function NicknameScreen({
    pin,
    quizTitle,
    busy,
    taken,
    error,
    onEdit,
    onSubmit,
}: {
    pin: string;
    quizTitle: string;
    busy: boolean;
    taken: string | null;
    error: string | null;
    onEdit: () => void;
    onSubmit: (nickname: string) => void;
}) {
    const { t } = useI18n();
    const id = useId();
    const [value, setValue] = useState('');
    const parsed = nicknameSchema.safeParse(value);
    const length = normalizeNickname(value).length;
    return (
        <form
            className="play-form"
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                if (parsed.success && !busy) onSubmit(parsed.data);
            }}
        >
            <div className="card play-game-card">
                <span className="muted tnum play-game-pin">{t.play.gamePin(formatPin(pin))}</span>
                <span className="play-game-title">{quizTitle}</span>
            </div>
            <div className="field">
                <label className="label" htmlFor={id}>
                    {t.play.nick}
                </label>
                <input
                    id={id}
                    className={taken ? 'input play-nick-input invalid' : 'input play-nick-input'}
                    autoComplete="off"
                    enterKeyHint="go"
                    value={value}
                    aria-invalid={taken ? true : undefined}
                    aria-describedby={taken ? `${id}-err` : `${id}-hint`}
                    onChange={(e) => {
                        setValue(e.target.value);
                        onEdit();
                    }}
                />
                {taken ? (
                    <span id={`${id}-err`} className="err" role="alert">
                        {t.play.nickTaken(taken)}
                    </span>
                ) : (
                    <span id={`${id}-hint`} className="row-c play-nick-meta">
                        <span className="hint">{t.play.nickHint}</span>
                        <span className={length > NICKNAME_MAX ? 'hint tnum play-over' : 'hint tnum'}>
                            {t.play.nickCount(length, NICKNAME_MAX)}
                        </span>
                    </span>
                )}
            </div>
            <Button type="submit" variant="primary" size="lg" block disabled={!parsed.success || busy}>
                {t.play.enter}
            </Button>
            {error && (
                <p className="err play-form-err" role="alert">
                    {error}
                </p>
            )}
        </form>
    );
}
