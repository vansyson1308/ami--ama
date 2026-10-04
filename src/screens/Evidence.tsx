import { useEffect, useState } from 'react';
import { t, type StrKey } from '../i18n';
import { loadMeta, type ModelCard } from '../ml/model';
import { QUESTIONS } from '../lib/content';

const pct = (v?: number) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const num = (v?: number) => (v == null ? '—' : v.toFixed(3));

interface Ds {
  name: string;
  license: string;
  n: string;
  note: string;
}

export default function Evidence() {
  const [card, setCard] = useState<ModelCard | null>(null);
  useEffect(() => {
    loadMeta().then((m) => setCard(m.card));
  }, []);
  if (!card) return null;
  const f = card.metrics.test_rocole ?? {};
  const s = card.metrics.test_jmuben ?? {};
  const rows: [StrKey, (m: Record<string, number>) => string][] = [
    ['ev_n', (m) => String(m.n ?? '—')],
    ['ev_acc', (m) => pct(m.acc)],
    ['ev_f1', (m) => num(m.macro_f1)],
    ['ev_cov', (m) => pct(m.coverage_at_tau)],
    ['ev_acc_tau', (m) => pct(m.acc_at_tau)],
    ['ev_ece', (m) => num(m.ece)],
  ];
  const notCovered = (card.not_covered as string[]) ?? [];
  const gate = card.class_gate as
    | { min_precision: number; field_val: Record<string, { precision: number | null; accepted_predictions: number }> }
    | undefined;
  const never = card.never_assert ?? [];
  const ood = (card.ood as { commons?: { n: number; wrong_assertion: number; abstain: number } } | undefined)?.commons;
  const nameOf = (k: string) => (card.labels_list as { key: string; vi_name: string }[] | undefined)?.find((l) => l.key === k)?.vi_name ?? k;
  const datasets = (card.datasets as Ds[]) ?? [];
  return (
    <div className="screen evidence" data-testid="evidence">
      <h1>{t('ev_title')}</h1>
      <p className="muted">{t('ev_sub')}</p>
      <div className="kv">
        <div><span>{t('ev_model')}</span><b>{card.version} · {card.arch}</b></div>
        <div><span>{t('ev_size')}</span><b>{(card.size_bytes / 1e6).toFixed(2)} MB · int8 ONNX</b></div>
        <div><span>{t('ev_tau')}</span><b>τ = {card.tau.toFixed(2)} · T = {card.temperature.toFixed(2)}</b></div>
      </div>
      <p className="muted small">{t('ev_rule')}</p>
      <table className="mtable" data-testid="metrics">
        <thead>
          <tr>
            <th></th>
            <th>{t('ev_field')}</th>
            <th>{t('ev_studio')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, fn]) => (
            <tr key={k}>
              <td>{t(k)}</td>
              <td className="num fieldcol">{fn(f)}</td>
              <td className="num">{fn(s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {gate && (
        <>
          <h2>{t('ev_gate_t')}</h2>
          <p className="muted small">{t('ev_gate_rule', { min: Math.round(gate.min_precision * 100) })}</p>
          <table className="mtable" data-testid="class-gate">
            <thead>
              <tr>
                <th>{t('ev_gate_col_class')}</th>
                <th>{t('ev_gate_col_prec')}</th>
                <th>{t('ev_gate_col_n')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(gate.field_val).map(([k, v]) => (
                <tr key={k}>
                  <td>{nameOf(k)}</td>
                  <td className="num">{pct(v.precision ?? undefined)}</td>
                  <td className="num">{v.accepted_predictions}</td>
                  <td className={never.includes(k) ? 'gate-no' : 'gate-ok'}>
                    {never.includes(k) ? t('ev_gate_never') : t('ev_gate_ok')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{t('ev_gate_studio')}</p>
        </>
      )}
      <h2>{t('ev_unsure_t')}</h2>
      <ol className="steps-list" data-testid="unsure-flow">
        <li>{t('ev_unsure_1')}</li>
        <li>{t('ev_unsure_2')}</li>
        <li>{t('ev_unsure_3')}</li>
        <li>{t('ev_unsure_4')}</li>
      </ol>
      <p className="muted small">
        {t('ev_unsure_draft')} {QUESTIONS.review_status}
      </p>
      <h2>{t('ev_not_covered')}</h2>
      <ul className="dash">
        {notCovered.map((x) => <li key={x}>{x}</li>)}
      </ul>
      <h2>{t('ev_limits')}</h2>
      <ul className="dash">
        <li>{t('ev_limit_1')}</li>
        <li>{t('ev_limit_2')}</li>
        <li>{t('ev_limit_3')}</li>
        {ood && (
          <li data-testid="ood">
            {t('ev_ood', { n: ood.n, wrong: ood.wrong_assertion, pct: Math.round((ood.wrong_assertion / ood.n) * 100), abstain: ood.abstain })}
          </li>
        )}
      </ul>
      <h2>{t('ev_datasets')}</h2>
      <ul className="dash">
        {datasets.map((d) => (
          <li key={d.name}><b>{d.name}</b> — {d.license} · {d.n}. <span className="muted">{d.note}</span></li>
        ))}
      </ul>
      <p className="muted small">sha256 {card.sha256.slice(0, 16)}… · {String(card.date)}</p>
    </div>
  );
}
