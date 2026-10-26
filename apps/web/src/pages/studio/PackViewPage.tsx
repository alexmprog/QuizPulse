import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, type Schemas } from '../../api/client';
import { packsApi, useCopyPack } from '../../api/packs';
import { errorText } from '../../i18n/errors';
import { useI18n, type Dict } from '../../i18n/i18n';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Spinner } from '../../ui/Spinner';

type Question = Schemas['Question'];

function typeLabel(t: Dict, q: Question): string {
    if (q.type === 'single_choice') return t.studio.typeSingle;
    return q.type === 'true_false' ? t.studio.typeTrueFalse : t.studio.typeNumeric;
}

function Answers({ q }: { q: Question }) {
    const { t } = useI18n();
    if (q.type === 'numeric') {
        return (
            <p className="pack-q-numeric">{t.studio.numericAnswer(q.numericAnswer ?? 0, q.numericTolerance ?? 0)}</p>
        );
    }
    const options = q.type === 'true_false' ? [t.studio.optionTrue, t.studio.optionFalse] : q.options;
    return (
        <ul className="pack-q-options">
            {options.map((o, i) => (
                <li key={i} className={i === q.correctOption ? 'pack-q-option correct' : 'pack-q-option'}>
                    <span>{o}</span>
                    {i === q.correctOption && <Badge tone="success">{t.studio.correct}</Badge>}
                </li>
            ))}
        </ul>
    );
}

export function PackViewPage() {
    const { t } = useI18n();
    const { id = '' } = useParams();
    const { copy, pending } = useCopyPack();
    const [pack, setPack] = useState<Schemas['Quiz'] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        packsApi.get(id).then(
            (p) => {
                if (alive) setPack(p);
            },
            (e: unknown) => {
                if (alive) setError(errorText(t, e instanceof ApiError ? e.code : 'INTERNAL_ERROR'));
            },
        );
        return () => {
            alive = false;
        };
    }, [id, t]);

    return (
        <>
            <Link className="link" to="/studio/packs">
                ← {t.studio.packBack}
            </Link>
            {error && <p className="muted">{error}</p>}
            {!pack && !error && <Spinner label={t.common.loading} />}
            {pack && (
                <>
                    <header className="studio-head">
                        <div>
                            <h1 className="display">{pack.title}</h1>
                            <p className="muted">
                                {pack.language === 'ru' ? t.prefs.ru : t.prefs.en} ·{' '}
                                {t.studio.questionsCount(pack.questions.length)} · {t.studio.readOnly}
                            </p>
                        </div>
                        <Button
                            variant="primary"
                            disabled={pending}
                            onClick={() => {
                                void copy(pack);
                            }}
                        >
                            {t.studio.copyPack}
                        </Button>
                    </header>
                    <ol className="pack-questions">
                        {pack.questions.map((q) => (
                            <li className="card pack-q" key={q.id}>
                                <span className="muted pack-q-type">{typeLabel(t, q)}</span>
                                <h2 className="pack-q-text">{q.text}</h2>
                                <Answers q={q} />
                            </li>
                        ))}
                    </ol>
                </>
            )}
        </>
    );
}
