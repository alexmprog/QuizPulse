import type { HostView, QuestionPublic } from '@quizpulse/protocol';
import { useI18n } from '../../../i18n/i18n';
import { AnswerSlot } from '../../../ui/AnswerSlot';
import { answeredOf, answerTiles } from '../hostScreen';
import { TimerRing } from './TimerRing';

function Answered({ view }: { view: HostView }) {
    const { t } = useI18n();
    const { answered, total } = answeredOf(view);
    return (
        <div className="host-answered">
            <div className="display tnum host-answered-num">
                {answered}
                <span className="muted"> / {total}</span>
            </div>
            <div className="muted host-answered-label">{t.host.answered}</div>
        </div>
    );
}

/** An open question. Never shows which answer is correct: `QuestionPublic` does not carry it. */
export function QuestionScreen({ view, question }: { view: HostView; question: QuestionPublic }) {
    const { t } = useI18n();
    const totalMs = question.timeLimitSeconds * 1000;
    const tiles = answerTiles(question, t.host.optionTrue, t.host.optionFalse);
    const image = question.imageUrl ? <img className="host-image" src={question.imageUrl} alt={t.host.image} /> : null;

    if (question.type === 'true_false') {
        return (
            <div className="host-question">
                <div className="row-c host-q-row host-q-row-tf">
                    <TimerRing countdown={view.countdown} totalMs={totalMs} />
                    <div className="host-q-tf-center">
                        <h2 className="display host-q-text host-q-text-tf">{question.text}</h2>
                        {image}
                    </div>
                    <Answered view={view} />
                </div>
                <div className="host-tf">
                    {tiles.map((tile) => (
                        <AnswerSlot key={tile.option} index={tile.slot} label={tile.label} size="host" />
                    ))}
                </div>
            </div>
        );
    }

    if (question.type === 'numeric') {
        return (
            <div className="host-question">
                <h2 className="display host-q-text host-q-text-num">{question.text}</h2>
                <div className="row-c host-q-row">
                    <TimerRing countdown={view.countdown} totalMs={totalMs} big />
                    {image}
                    <div className="card host-num-card">
                        <div className="row-c host-num-digits" aria-hidden="true">
                            <span className="display">?</span>
                            <span className="display">?</span>
                            <span className="display">?</span>
                        </div>
                        <div className="host-num-hint">{t.host.typeNumber}</div>
                    </div>
                    <Answered view={view} />
                </div>
            </div>
        );
    }

    return (
        <div className="host-question">
            <h2 className="display host-q-text">{question.text}</h2>
            <div className="row-c host-q-row">
                <TimerRing countdown={view.countdown} totalMs={totalMs} />
                {image}
                <Answered view={view} />
            </div>
            <div className="host-options">
                {tiles.map((tile) => (
                    <AnswerSlot key={tile.option} index={tile.slot} label={tile.label} size="host" />
                ))}
            </div>
        </div>
    );
}
