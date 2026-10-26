import { PIN_LENGTH, pinSchema } from '@quizpulse/protocol';
import { useI18n } from '../../../i18n/i18n';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';

/**
 * PIN entry: digits only, up to `PIN_LENGTH`; «Next» asks the server whether the game exists. There is no
 * `maxLength`: a pasted «482 931» must lose its space, not its last digit (`onChange` strips and cuts).
 */
export function PinScreen({
    digits,
    error,
    busy,
    onDigits,
    onSubmit,
}: {
    digits: string;
    error: string | null;
    busy: boolean;
    onDigits: (digits: string) => void;
    onSubmit: () => void;
}) {
    const { t } = useI18n();
    const valid = pinSchema.safeParse(digits).success;
    return (
        <form
            className="play-form"
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                if (valid && !busy) onSubmit();
            }}
        >
            <h1 className="display play-title">{t.play.joinTitle}</h1>
            <Field
                label={t.play.pin}
                large
                className="tnum play-pin-input"
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="go"
                value={digits}
                hint={t.play.pinHint}
                error={error ?? undefined}
                onChange={(e) => {
                    onDigits(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH));
                }}
            />
            <Button type="submit" variant="primary" size="lg" block disabled={!valid || busy}>
                {t.play.next}
            </Button>
        </form>
    );
}
