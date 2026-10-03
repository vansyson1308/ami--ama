import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { go } from '../App';
import { AdviceCard, Listen } from '../components';
import { card } from '../lib/content';
import { addEntry, type LogEntry, type Settings } from '../lib/store';
import { confLevel } from '../ml/decide';
import { loadMeta, type Analysis, type Label, type ModelCard } from '../ml/model';

const CONF_KEY = { high: 'res_conf_high', mid: 'res_conf_mid', low: 'res_conf_low' } as const;

function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (!('geolocation' in navigator)) return res(null);
    navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 8000, maximumAge: 600000 });
  });
}

export default function Result({ analysis, photo, settings }: { analysis: Analysis; photo: string | null; settings: Settings }) {
  const [meta, setMeta] = useState<{ card: ModelCard; labels: Label[] } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    loadMeta().then(setMeta);
  }, []);
  const d = analysis.decision;
  if (d.kind !== 'retake' && !meta) return null;

  let cardId: string;
  let name = '';
  let maybe: string[] = [];
  let conf = '';
  let confKind: 'high' | 'mid' | 'low' = 'low';
  if (d.kind === 'retake') cardId = 'retake';
  else {
    const labels = meta!.labels;
    const p1 = d.probs[d.top[0]];
    confKind = d.kind === 'abstain' ? 'low' : confLevel(p1, meta!.card.tau);
    conf = t(CONF_KEY[confKind]);
    if (d.kind === 'predict') {
      cardId = labels[d.top[0]].card_id;
      name = labels[d.top[0]].vi_name;
    } else if (d.kind === 'not_coffee') {
      cardId = 'not_coffee_leaf';
      name = labels[d.top[0]].vi_name;
    } else {
      cardId = 'uncertain';
      maybe = d.top
        .slice(0, 2)
        .map((i) => labels[i])
        .filter((l) => l.key !== 'not_coffee_leaf')
        .map((l) => l.vi_name);
    }
  }
  const c = card(cardId);

  const save = async (): Promise<string | undefined> => {
    if (d.kind === 'retake' || !meta) return;
    if (savedId) return savedId;
    setSaving(true);
    const pos = settings.useGps ? await getPosition() : null;
    const e: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      kind: d.kind,
      cardId,
      name,
      maybe,
      conf,
      top: d.top.slice(0, 3).map((i) => ({ key: meta.labels[i].key, p: Math.round(d.probs[i] * 1000) / 1000 })),
      thumb: settings.savePhotos ? analysis.thumb : undefined,
      lat: pos ? Math.round(pos.coords.latitude * 1e5) / 1e5 : undefined,
      lng: pos ? Math.round(pos.coords.longitude * 1e5) / 1e5 : undefined,
      note: '',
      shared: false,
      model: meta.card.version,
    };
    await addEntry(e);
    setSavedId(e.id);
    setSaving(false);
    return e.id;
  };
  // Escalation saves the observation first, so the message can include it (store-and-forward).
  const ask = async () => go('ask', await save());

  return (
    <div className={`screen result kind-${d.kind}`} data-testid="result" data-kind={d.kind} data-card={cardId} data-ms={Math.round(analysis.ms)}
      data-probs={d.kind !== 'retake' ? JSON.stringify(d.probs.map((p) => Number(p.toFixed(5)))) : undefined}>
      <div className="result-head">
        {photo && <img className="result-photo" src={photo} alt="" />}
        <div>
          <h1 data-testid="result-title">{c.title}</h1>
          {conf && d.kind !== 'abstain' && <p className={`conf conf-${confKind}`}>{conf}</p>}
        </div>
      </div>
      {maybe.length > 0 && (
        <p className="maybe" data-testid="maybe">
          {t('res_maybe')} <b>{maybe.join(` ${t('res_or')} `)}</b>
        </p>
      )}
      <Listen id={cardId} text={c.audio_text} />
      {d.kind === 'abstain' && (
        <button className="btn primary big" onClick={ask}>
          {t('res_ask')}
        </button>
      )}
      <AdviceCard c={c} />
      {d.kind !== 'retake' && meta && (
        <details className="details">
          <summary>{t('res_details')}</summary>
          <p className="muted small">{t('res_details_note')}</p>
          <ul data-testid="probs">
            {d.top.slice(0, 3).map((i) => (
              <li key={i} data-key={meta.labels[i].key} data-p={d.probs[i].toFixed(4)}>
                {meta.labels[i].vi_name}: {(d.probs[i] * 100).toFixed(1)}%
              </li>
            ))}
          </ul>
          <p className="muted small">
            {meta.card.version} · τ={meta.card.tau.toFixed(2)} · {Math.round(analysis.ms)} ms
          </p>
        </details>
      )}
      <p className="muted small">{t('res_review')}</p>
      <div className="actions">
        {d.kind !== 'retake' && (
          <button className="btn primary" onClick={() => save()} disabled={!!savedId || saving} data-testid="save">
            {savedId ? t('res_saved') : t('res_save')}
          </button>
        )}
        {d.kind !== 'abstain' && (
          <button className="btn secondary" onClick={ask}>
            {t('res_ask')}
          </button>
        )}
        <button className="btn secondary" onClick={() => go('capture')}>
          {t('res_retake')}
        </button>
      </div>
    </div>
  );
}
