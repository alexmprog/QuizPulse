import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useCopyPack, packsApi } from '../../api/packs';
import type { Schemas } from '../../api/client';
import { useI18n } from '../../i18n/i18n';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Segmented } from '../../ui/Segmented';
import { Spinner } from '../../ui/Spinner';

type Filter = 'all' | 'ru' | 'en';

export function PacksPage() {
    const { t } = useI18n();
    const { copy, pending } = useCopyPack();
    const [filter, setFilter] = useState<Filter>('all');
    const [packs, setPacks] = useState<Schemas['QuizSummary'][] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        packsApi.list(filter === 'all' ? undefined : filter).then(
            (p) => {
                if (alive) setPacks(p);
            },
            () => {
                if (alive) setFailed(true);
            },
        );
        return () => {
            alive = false;
        };
    }, [filter]);

    return (
        <>
            <header className="studio-head">
                <h1 className="display">{t.studio.packsTitle}</h1>
                <Segmented<Filter>
                    label={t.studio.packLanguage}
                    value={filter}
                    onChange={(f) => {
                        setPacks(null);
                        setFailed(false);
                        setFilter(f);
                    }}
                    options={[
                        { value: 'all', label: t.studio.all },
                        { value: 'ru', label: t.prefs.ru },
                        { value: 'en', label: t.prefs.en },
                    ]}
                />
            </header>
            {failed && <p className="muted">{t.studio.loadFailed}</p>}
            {!packs && !failed && <Spinner label={t.common.loading} />}
            {packs?.length === 0 && <p className="muted">{t.studio.packsEmpty}</p>}
            {packs && packs.length > 0 && (
                <div className="grid-cards">
                    {packs.map((p) => (
                        <article className="card quiz-card" key={p.id}>
                            <div className="quiz-card-top">
                                <Badge tone="accent">{p.language === 'ru' ? t.prefs.ru : t.prefs.en}</Badge>
                                <span className="muted">{t.studio.questionsCount(p.questionCount)}</span>
                            </div>
                            <h2 className="quiz-card-title">{p.title}</h2>
                            <div className="quiz-card-actions">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    disabled={pending}
                                    onClick={() => {
                                        void copy(p);
                                    }}
                                >
                                    {t.studio.copyPack}
                                </Button>
                                <Link className="btn btn-sm" to={`/studio/packs/${p.id}`}>
                                    {t.studio.view}
                                </Link>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </>
    );
}
