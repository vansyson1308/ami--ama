import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import { go, MAX_LEAVES, type Check } from '../App';
import { AdviceCard, fmtDate, Listen } from '../components';
import { card } from '../lib/content';
import { addEntry, updateEntry, type LogEntry, type Settings } from '../lib/store';
import { confLevel, type Decision } from '../ml/decide';
import { aggregate, reasonOf, type AbstainReason } from '../ml/aggregate';
import { type Answer, type CoffeeKey, type Outcome } from '../ml/differential';
import { loadMeta, type Label, type ModelCard } from '../ml/model';
import Differential from './Differential';

const CONF_KEY = { high: 'res_conf_high', mid: 'res_conf_mid', low: 'res_conf_low' } as const;
const FOLLOW_UP_DAYS = 4;
const DIF_MARGIN = 0.25; // also offer "Phân biệt" when the top-2 are this close

function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (!('geolocation' in navigator)) return res(null);
    navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 8000, maximumAge: 600000 });
  });
}

interface Combined {
  decision: Decision;
  n: number;
  skipped: number;
  disagree: boolean;
}

/** One leaf: the unchanged v1.0 single-image decision. 2–3 leaves: aggregate() (mean of logits/T). */
function combine(check: Check, mc: ModelCard, labels: Label[]): Combined {
  if (check.leaves.length === 1) return { decision: check.leaves[0].analysis.decision, n: 1, skipped: 0, disagree: false };
  const nc = labels.find((l) => l.key === 'not_coffee_leaf')!.id;
  const never = (mc.never_assert ?? []).map((k) => labels.find((l) => l.key === k)!.id);
  const agg = aggregate(
    check.leaves.map((l) => ({ ok: l.analysis.decision.kind !== 'retake' && !!l.analysis.logits, logits: l.analysis.logits })),
    mc.temperature,
    mc.tau,
    mc.margin,
    nc,
    never,
  );
  return { decision: agg.decision, n: agg.used, skipped: agg.skipped, disagree: agg.disagree };
}

export default function Result({ check, settings }: { check: Check; settings: Settings }) {
  const [meta, setMeta] = useState<{ card: ModelCard; labels: Label[] } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showQ, setShowQ] = useState(false);
  const [res, setRes] = useState<{ o: Outcome; answers: Record<string, Answer>; cands: [CoffeeKey, CoffeeKey] } | null>(null);
  const [followAt, setFollowAt] = useState<number | null>(null);
  useEffect(() => {
    loadMeta().then(setMeta);
  }, []);
  // a new leaf -> a new result; forget answers of the previous combination
  useEffect(() => {
    setRes(null);
    setShowQ(false);
    setSavedId(null);
    setFollowAt(null);
  }, [check]);
  const comb = useMemo(() => (meta ? combine(check, meta.card, meta.labels) : null), [check, meta]);
  const first = check.leaves[0].analysis.decision;
  if (first.kind !== 'retake' && !comb) return null;
  const d: Decision = comb ? comb.decision : first;
  const nLeaves = check.leaves.length;
  const labels = meta?.labels ?? [];

  let cardId: string;
  let name = '';
  let maybe: string[] = [];
  let conf = '';
  let confKind: 'high' | 'mid' | 'low' = 'low';
  if (d.kind === 'retake') cardId = 'retake';
  else {
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
      // Gated class (low field precision): name only that class as a possibility, never assert it.
      maybe = d.top
        .slice(0, d.gated ? 1 : 2)
        .map((i) => labels[i])
        .filter((l) => l.key !== 'not_coffee_leaf')
        .map((l) => l.vi_name);
    }
  }
  const reason: AbstainReason | undefined = meta ? reasonOf(d, meta.card.tau, meta.card.margin, comb?.disagree) : 'quality';
  const uncertain = d.kind === 'abstain';
  const closeCall = d.kind === 'predict' && d.probs[d.top[0]] - d.probs[d.top[1]] < DIF_MARGIN;
  const canAddLeaf = nLeaves < MAX_LEAVES;

  // what the farmer is shown after the tell-apart step
  let shownCard = cardId;
  let assisted = false;
  if (res?.o.kind === 'assisted') {
    shownCard = labels.find((l) => l.key === (res.o as { key: string }).key)!.card_id;
    name = labels.find((l) => l.key === (res.o as { key: string }).key)!.vi_name;
    assisted = true;
  } else if (res?.o.kind === 'nutrition') shownCard = 'not_disease_nutrition';
  const c = card(shownCard);
  const fillWarn = check.leaves.some((l) => l.analysis.quality.fillWarn);

  const entryFields = (): Partial<LogEntry> => ({
    cardId: shownCard,
    name: assisted ? name : res?.o.kind === 'nutrition' ? t('case_nutrition') : name,
    maybe: res?.o.kind === 'uncertain' || !res ? maybe : [],
    conf: assisted || res?.o.kind === 'nutrition' ? t('assisted_conf') : conf,
    nLeaves,
    reason,
    answers: res?.answers,
    posterior: res ? Object.fromEntries(Object.entries(res.o.posterior).map(([k, v]) => [k, Math.round(v * 1000) / 1000])) : undefined,
    assisted: assisted || undefined,
  });

  const save = async (): Promise<string | undefined> => {
    if (d.kind === 'retake' || !meta) return;
    if (savedId) {
      await updateEntry(savedId, entryFields());
      return savedId;
    }
    setSaving(true);
    const pos = settings.useGps ? await getPosition() : null;
    const thumbs = check.leaves.map((l) => l.analysis.thumb);
    const e: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      kind: d.kind,
      cardId: shownCard,
      name,
      maybe,
      conf,
      top: d.top.slice(0, 3).map((i) => ({ key: meta.labels[i].key, p: Math.round(d.probs[i] * 1000) / 1000 })),
      thumb: settings.savePhotos ? thumbs[0] : undefined,
      photos: settings.savePhotos && thumbs.length > 1 ? thumbs : undefined,
      lat: pos ? Math.round(pos.coords.latitude * 1e5) / 1e5 : undefined,
      lng: pos ? Math.round(pos.coords.longitude * 1e5) / 1e5 : undefined,
      note: '',
      shared: false,
      pending: true,
      model: meta.card.version,
      parentId: check.parentId,
      ...entryFields(),
    };
    await addEntry(e);
    if (check.parentId) await updateEntry(check.parentId, { followUpAt: undefined });
    setSavedId(e.id);
    setSaving(false);
    return e.id;
  };
  // Escalation saves the observation first, so the case packet can include it (store-and-forward).
  const ask = async () => go('ask', await save());
  const remind = async () => {
    const id = await save();
    if (!id) return;
    const at = Date.now() + FOLLOW_UP_DAYS * 86400000;
    await updateEntry(id, { followUpAt: at });
    setFollowAt(at);
  };

  // "Phân biệt": the primary step for uncertain results once more leaves were added (or skipped); optional on close calls.
  const showDif = !!meta && d.kind !== 'retake' && !res && ((uncertain && (showQ || !canAddLeaf)) || closeCall);

  return (
    <div
      className={`screen result kind-${d.kind}`}
      data-testid="result"
      data-kind={d.kind}
      data-card={shownCard}
      data-reason={reason}
      data-leaves={nLeaves}
      data-assisted={assisted ? '1' : undefined}
      data-ms={Math.round(check.leaves[nLeaves - 1].analysis.ms)}
      data-probs={d.kind !== 'retake' ? JSON.stringify(d.probs.map((p) => Number(p.toFixed(5)))) : undefined}
    >
      <div className="result-head">
        <img className="result-photo" src={check.leaves[0].photo} alt="" />
        <div>
          <h1 data-testid="result-title">{c.title}</h1>
          {assisted && (
            <p className="badge-assisted" data-testid="assisted-badge">
              {t('assisted_badge')}
            </p>
          )}
          {!res && conf && d.kind !== 'abstain' && <p className={`conf conf-${confKind}`}>{conf}</p>}
        </div>
      </div>
      {nLeaves > 1 && (
        <div className="leaves" data-testid="leaves">
          {check.leaves.map((l, i) => (
            <img key={i} src={l.photo} alt="" />
          ))}
          <span data-testid="leaves-count">
            {t('chk_from', { n: comb?.n ?? nLeaves })}
            {comb && comb.skipped > 0 && ` · ${t('chk_skipped', { n: comb.skipped })}`}
          </span>
        </div>
      )}
      {comb?.disagree && <p className="muted small">{t('chk_disagree')}</p>}
      {fillWarn && d.kind !== 'retake' && (
        <p className="tip" data-testid="fill-warn">
          📏 {t('fill_warn')}
        </p>
      )}
      {maybe.length > 0 && !res && (
        <p className="maybe" data-testid="maybe">
          {t('res_maybe')} <b>{maybe.join(` ${t('res_or')} `)}</b>
        </p>
      )}
      <Listen id={shownCard} text={c.audio_text} />

      {/* Uncertain: exactly one primary next step */}
      {uncertain && !res && canAddLeaf && !showQ && (
        <>
          <button className="btn primary big" onClick={() => go('capture', 'add')} data-testid="add-leaves">
            {t('chk_more', { n: MAX_LEAVES - nLeaves })}
          </button>
          <button className="btn secondary wide" onClick={() => setShowQ(true)} data-testid="dif-now">
            {t('dif_now')}
          </button>
        </>
      )}
      {d.kind === 'retake' && (
        <>
          <p className="tip">{t('tip_underside')}</p>
          <p className="tip">{t('tip_closer')}</p>
        </>
      )}
      {showDif && meta && 'probs' in d && (
        <Differential
          probs={d.probs}
          labels={meta.labels}
          primary={uncertain}
          onDone={(o, answers, cands) => setRes({ o, answers, cands })}
        />
      )}

      <AdviceCard c={c} />

      {(res?.o.kind === 'uncertain' || res?.o.kind === 'nutrition') && (
        <section className="wait" data-testid="waiting">
          <h2>{t('wait_title')}</h2>
          <p>{t('wait_steps')}</p>
        </section>
      )}
      {(uncertain || res) && d.kind !== 'retake' && (
        <div className="actions">
          {res && res.o.kind !== 'assisted' && (
            <button className="btn primary big" onClick={ask} data-testid="send-case">
              {t('send_case')}
            </button>
          )}
          {followAt ? (
            <p className="toast" data-testid="reminded">
              {t('reminded', { date: fmtDate(followAt) })}
            </p>
          ) : (
            <button className="btn secondary wide" onClick={remind} data-testid="remind">
              {t('remind')}
            </button>
          )}
        </div>
      )}

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
            {meta.card.version} · τ={meta.card.tau.toFixed(2)} · {Math.round(check.leaves[nLeaves - 1].analysis.ms)} ms
            {nLeaves > 1 && ` · ${t('chk_from', { n: comb?.n ?? nLeaves })}`}
          </p>
        </details>
      )}
      <p className="muted small">{t('res_review')}</p>
      <div className="actions">
        {d.kind !== 'retake' && (
          <button
            className={`btn ${uncertain || res ? 'secondary' : 'primary'}`}
            onClick={() => save()}
            disabled={!!savedId || saving}
            data-testid="save"
          >
            {savedId ? t('res_saved') : t('res_save')}
          </button>
        )}
        <button className="btn secondary" onClick={ask} data-testid="ask-person">
          {t('res_ask')}
        </button>
        <button className="btn secondary" onClick={() => go('capture')}>
          {t('res_retake')}
        </button>
      </div>
    </div>
  );
}
