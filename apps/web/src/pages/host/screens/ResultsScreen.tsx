import type { QuestionPublic, QuestionResults } from '@quizpulse/protocol';
import type { CSSProperties } from 'react';
import { formatNumber } from '../../../i18n/format';
import { useI18n } from '../../../i18n/i18n';
import { SLOT_SHAPES } from '../../../ui/AnswerSlot';
import { answerTiles, signedDiff } from '../hostScreen';

const SLOT_LETTERS = ['a', 'b', 'c', 'd'] as const;

function CheckIcon() {
    return (
        <svg
            className="host-result-check"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            aria-hidden="true"
        >
            <path d="M5 12l5 5 9-10" />
        </svg>
    );
}

function OptionResults({ question, results }: { question: QuestionPublic; results: QuestionResults }) {
    const { t } = useI18n();
    const tiles = answerTiles(question, t.host.optionTrue, t.host.optionFalse);
    const counts = results.optionCounts ?? [];
    const max = Math.max(1, ...counts);
    return (
        <div className="host-results" style={{ '--cols': String(tiles.length) } as CSSProperties}>
            {tiles.map((tile) => {
                const count = counts[tile.option] ?? 0;
                const correct = tile.option === results.correctOption;
                const letter = SLOT_LETTERS[tile.slot % 4] ?? 'a';
                return (
                    <div key={tile.option} className={correct ? 'host-result is-correct' : 'host-result is-dim'}>
                        <div className="display tnum host-result-count">{count}</div>
                        <div
                            className={`host-result-bar fill-${letter}`}
                            style={{ '--h': String(count / max) } as CSSProperties}
                        />
                        <div className={`host-result-tile host-result-tile-${letter}`}>
                            <span className={`shape ${SLOT_SHAPES[tile.slot % 4] ?? 'tri'}`} aria-hidden="true" />
                            <span className="host-result-label">{tile.label}</span>
                            {correct && (
                                <>
                                    <CheckIcon />
                                    <span className="sr-only">{t.host.correct}</span>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function NumericResults({ question, results }: { question: QuestionPublic; results: QuestionResults }) {
    const { t, lang } = useI18n();
    const answer = results.numericAnswer ?? 0;
    const tolerance = results.numericTolerance ?? 0;
    const closest = results.closestNumeric ?? [];
    return (
        <div className="host-numeric">
            <section className="host-numeric-main">
                <h2 className="muted host-numeric-q">{question.text}</h2>
                <div className="host-numeric-label muted">{t.host.correct}</div>
                <div className="display tnum host-numeric-answer">{formatNumber(lang, answer)}</div>
                <span className="badge badge-success host-badge-lg host-numeric-tol">
                    {t.host.tolerance(tolerance)}
                </span>
                <div className="muted host-no-answer">{t.host.noAnswer(results.noAnswerCount)}</div>
            </section>
            {closest.length > 0 && (
                <section className="card host-closest">
                    <h3 className="display">{t.host.closest}</h3>
                    <ol className="host-closest-list">
                        {closest.slice(0, 3).map((c, i) => {
                            const inTolerance = Math.abs(c.value - answer) <= tolerance;
                            return (
                                <li key={`${c.nickname}-${String(i)}`} className="row-c host-closest-row">
                                    <span className="display tnum host-closest-rank">{i + 1}</span>
                                    <span className="host-closest-nick">{c.nickname}</span>
                                    <span className="display tnum host-closest-value">
                                        {formatNumber(lang, c.value)}
                                    </span>
                                    <span className={inTolerance ? 'badge badge-success tnum' : 'badge tnum'}>
                                        {signedDiff(c.value, answer)}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </section>
            )}
        </div>
    );
}

/** The closed question: answer distribution for options, the right number and closest guesses for numeric. */
export function ResultsScreen({ question, results }: { question: QuestionPublic; results: QuestionResults }) {
    const { t } = useI18n();
    if (question.type === 'numeric') return <NumericResults question={question} results={results} />;
    return (
        <div className="host-question">
            <h2 className="display host-q-text host-q-text-results">{question.text}</h2>
            <OptionResults question={question} results={results} />
            <div className="muted host-no-answer host-no-answer-center">{t.host.noAnswer(results.noAnswerCount)}</div>
        </div>
    );
}
