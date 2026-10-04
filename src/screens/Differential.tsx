import { useMemo, useState } from 'react';
import { t } from '../i18n';
import { Listen } from '../components';
import { QUESTIONS, REF_PHOTO } from '../lib/content';
import {
  candidates,
  coffeePrior,
  outcome,
  selectQuestions,
  type Answer,
  type CoffeeKey,
  type Outcome,
} from '../ml/differential';
import type { Label } from '../ml/model';

// "Phân biệt" panel: top-2 candidates with reference photos + up to 3 yes/no/không rõ questions (fixed content).
export default function Differential({
  probs,
  labels,
  primary,
  onDone,
}: {
  probs: number[];
  labels: Label[];
  primary: boolean;
  onDone: (o: Outcome, answers: Record<string, Answer>, cands: [CoffeeKey, CoffeeKey]) => void;
}) {
  const prior = useMemo(() => coffeePrior(Object.fromEntries(labels.map((l) => [l.key, probs[l.id]]))), [probs, labels]);
  const cands = useMemo(() => candidates(prior), [prior]);
  const qs = useMemo(() => selectQuestions(cands, QUESTIONS.questions), [cands]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const name = (k: string) => labels.find((l) => l.key === k)?.vi_name ?? k;
  const answered = Object.keys(answers).length;

  return (
    <section className="dif" data-testid="differential" data-cands={cands.join(',')}>
      <h2>{t('dif_title', { a: name(cands[0]), b: name(cands[1]) })}</h2>
      <p className="muted small">{t('dif_intro')}</p>
      <div className="dif-cands">
        {cands.map((k) => (
          <figure key={k} className="dif-cand">
            <img src={REF_PHOTO[k]} alt={`${t('dif_ref')}: ${name(k)}`} />
            <figcaption>{name(k)}</figcaption>
          </figure>
        ))}
      </div>
      <ol className="dif-qs">
        {qs.map((q) => (
          <li key={q.id} className="dif-q" data-qid={q.id}>
            <p>{q.text}</p>
            <div className="row">
              <Listen id={q.id} text={q.text} />
            </div>
            <div className="seg" role="group" aria-label={q.text}>
              {(['yes', 'no', 'unsure'] as Answer[]).map((a) => (
                <button
                  key={a}
                  className={`btn seg-btn ${answers[q.id] === a ? 'on' : ''}`}
                  aria-pressed={answers[q.id] === a}
                  data-answer={a}
                  onClick={() => setAnswers({ ...answers, [q.id]: a })}
                >
                  {t(a === 'yes' ? 'dif_yes' : a === 'no' ? 'dif_no' : 'dif_unsure')}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <button
        className={`btn ${primary ? 'primary big' : 'secondary wide'}`}
        disabled={answered === 0}
        data-testid="dif-show"
        onClick={() => onDone(outcome(prior, answers, qs), answers, cands)}
      >
        {t('dif_show')}
      </button>
      <p className="muted small">{QUESTIONS.review_status}</p>
    </section>
  );
}
