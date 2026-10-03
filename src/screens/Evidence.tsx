import { useEffect, useState } from 'react';
import { t, type StrKey } from '../i18n';
import { loadMeta, type ModelCard } from '../ml/model';

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
              <td className="num field">{fn(f)}</td>
              <td className="num">{fn(s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>{t('ev_not_covered')}</h2>
      <ul className="dash">
        {notCovered.map((x) => <li key={x}>{x}</li>)}
      </ul>
      <h2>{t('ev_limits')}</h2>
      <ul className="dash">
        <li>{t('ev_limit_1')}</li>
        <li>{t('ev_limit_2')}</li>
        <li>{t('ev_limit_3')}</li>
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
