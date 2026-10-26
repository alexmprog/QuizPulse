import { useI18n, type Lang } from '../i18n/i18n';
import { useTheme, type Theme } from '../theme/theme';
import { Segmented } from './Segmented';

export function PrefsSwitch() {
    const { lang, setLang, t } = useI18n();
    const { theme, setTheme } = useTheme();
    return (
        <div className="prefs">
            <Segmented<Lang>
                small
                label={t.prefs.language}
                value={lang}
                onChange={setLang}
                options={[
                    { value: 'ru', label: t.prefs.ru },
                    { value: 'en', label: t.prefs.en },
                ]}
            />
            <Segmented<Theme>
                small
                label={t.prefs.theme}
                value={theme}
                onChange={setTheme}
                options={[
                    { value: 'light', label: t.prefs.light },
                    { value: 'dark', label: t.prefs.dark },
                ]}
            />
        </div>
    );
}
