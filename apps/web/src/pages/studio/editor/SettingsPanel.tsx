import {
    AUTO_ADVANCE_DEFAULT_SECONDS,
    AUTO_ADVANCE_MAX_SECONDS,
    AUTO_ADVANCE_MIN_SECONDS,
    LEADERBOARD_EVERY_MAX,
    LEADERBOARD_EVERY_MIN,
    TIME_LIMIT_MAX_SECONDS,
    TIME_LIMIT_MIN_SECONDS,
} from '@quizpulse/protocol';
import type { Schemas } from '../../../api/client';
import { useI18n } from '../../../i18n/i18n';
import { Segmented } from '../../../ui/Segmented';
import { Switch } from '../../../ui/Switch';
import type { FieldErrors } from './draft';
import { NumberField } from './NumberField';

type Settings = Schemas['QuizSettings'];

interface SettingsPanelProps {
    settings: Settings;
    errors: FieldErrors;
    onChange: (s: Settings) => void;
}

// An emptied required number is NaN: it is not a valid integer, so the schema flags it and nothing is saved.
const orNaN = (v: number | null) => v ?? Number.NaN;

export function SettingsPanel({ settings, errors, onChange }: SettingsPanelProps) {
    const { t } = useI18n();
    const patch = (p: Partial<Settings>) => {
        onChange({ ...settings, ...p });
    };
    const bad = (key: keyof Settings) => (errors[`settings.${key}`] ? true : false);
    return (
        <aside className="card editor-settings" aria-labelledby="editor-settings-title">
            <h2 id="editor-settings-title" className="editor-panel-title">
                {t.editor.settingsTitle}
            </h2>
            <div className="field">
                <span className="label">{t.editor.advance}</span>
                <Segmented
                    label={t.editor.advance}
                    value={settings.advanceMode}
                    options={[
                        { value: 'manual', label: t.editor.advanceManual },
                        { value: 'auto', label: t.editor.advanceAuto },
                    ]}
                    onChange={(advanceMode) => {
                        // The seconds are validated in both modes but only shown in auto: never leave a hidden invalid value.
                        const s = settings.autoAdvanceSeconds;
                        const valid =
                            Number.isInteger(s) && s >= AUTO_ADVANCE_MIN_SECONDS && s <= AUTO_ADVANCE_MAX_SECONDS;
                        patch({
                            advanceMode,
                            ...(advanceMode === 'manual' &&
                                !valid && { autoAdvanceSeconds: AUTO_ADVANCE_DEFAULT_SECONDS }),
                        });
                    }}
                />
            </div>
            {settings.advanceMode === 'auto' && (
                <NumberField
                    label={t.editor.autoAfter}
                    value={Number.isNaN(settings.autoAdvanceSeconds) ? null : settings.autoAdvanceSeconds}
                    hint={t.editor.rangeHint(AUTO_ADVANCE_MIN_SECONDS, AUTO_ADVANCE_MAX_SECONDS)}
                    error={
                        bad('autoAdvanceSeconds')
                            ? t.editor.rangeHint(AUTO_ADVANCE_MIN_SECONDS, AUTO_ADVANCE_MAX_SECONDS)
                            : undefined
                    }
                    onChange={(v) => {
                        patch({ autoAdvanceSeconds: orNaN(v) });
                    }}
                />
            )}
            <NumberField
                label={t.editor.defaultTime}
                value={Number.isNaN(settings.defaultTimeLimitSeconds) ? null : settings.defaultTimeLimitSeconds}
                hint={t.editor.rangeHint(TIME_LIMIT_MIN_SECONDS, TIME_LIMIT_MAX_SECONDS)}
                error={
                    bad('defaultTimeLimitSeconds')
                        ? t.editor.rangeHint(TIME_LIMIT_MIN_SECONDS, TIME_LIMIT_MAX_SECONDS)
                        : undefined
                }
                onChange={(v) => {
                    patch({ defaultTimeLimitSeconds: orNaN(v) });
                }}
            />
            <div className="editor-switch-row">
                <div className="editor-switch-text">
                    <span className="label">{t.editor.earlyClose}</span>
                    <span className="hint">{t.editor.earlyCloseHint}</span>
                </div>
                <Switch
                    label={t.editor.earlyClose}
                    checked={settings.earlyClose}
                    onChange={(earlyClose) => {
                        patch({ earlyClose });
                    }}
                />
            </div>
            <NumberField
                label={t.editor.leaderboardEvery}
                value={Number.isNaN(settings.leaderboardEvery) ? null : settings.leaderboardEvery}
                hint={t.editor.leaderboardHint}
                error={
                    bad('leaderboardEvery')
                        ? t.editor.rangeHint(LEADERBOARD_EVERY_MIN, LEADERBOARD_EVERY_MAX)
                        : undefined
                }
                onChange={(v) => {
                    patch({ leaderboardEvery: orNaN(v) });
                }}
            />
        </aside>
    );
}
