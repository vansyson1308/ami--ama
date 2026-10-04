import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { go } from '../App';
import { fmtDate } from '../components';
import { deleteEntry, deleteLog, getLog, updateEntry, type LogEntry } from '../lib/store';
import { entryMessage, shareText } from '../lib/message';
import { loadMeta, type Label } from '../ml/model';

function ExpertAnswer({ e, labels, onSaved }: { e: LogEntry; labels: Label[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(e.expertLabel ?? '');
  const [note, setNote] = useState(e.expertNote ?? '');
  const nameOf = (k?: string) => (k === 'other' ? t('log_expert_other') : (labels.find((l) => l.key === k)?.vi_name ?? k));
  if (!open)
    return (
      <>
        {e.expertLabel && (
          <div className="muted small" data-testid="expert-saved">
            ✍️ {t('log_expert_saved')}: <b>{nameOf(e.expertLabel)}</b>
            {e.expertNote ? ` — ${e.expertNote}` : ''}
          </div>
        )}
        <button className="btn small" onClick={() => setOpen(true)} data-testid="expert-open">
          {t('log_expert')}
        </button>
      </>
    );
  return (
    <div className="expert">
      <label className="field">
        <span>{t('log_expert_pick')}</span>
        <select value={label} onChange={(ev) => setLabel(ev.target.value)} data-testid="expert-label">
          <option value="">—</option>
          {labels.map((l) => (
            <option key={l.key} value={l.key}>
              {l.vi_name}
            </option>
          ))}
          <option value="other">{t('log_expert_other')}</option>
        </select>
      </label>
      <input className="note" placeholder={t('log_expert_note')} value={note} onChange={(ev) => setNote(ev.target.value)} />
      <p className="muted small">{t('log_flywheel')}</p>
      <button
        className="btn small primary"
        disabled={!label}
        data-testid="expert-save"
        onClick={async () => {
          await updateEntry(e.id, { expertLabel: label, expertNote: note || undefined });
          setOpen(false);
          onSaved();
        }}
      >
        {t('log_expert_save')}
      </button>
    </div>
  );
}

export default function FieldLog() {
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [unsentOnly, setUnsentOnly] = useState(false);
  const [toast, setToast] = useState('');
  const reload = () => getLog().then(setLog);
  useEffect(() => {
    reload();
    loadMeta().then((m) => setLabels(m.labels));
  }, []);
  if (!log) return null;
  const shown = unsentOnly ? log.filter((e) => !e.shared) : log;
  const unsent = log.filter((e) => !e.shared).length;

  const shareAll = async () => {
    const text = log.map((e) => entryMessage(e)).join('\n');
    const r = await shareText(text || t('ask_general'));
    if (r !== 'failed') {
      for (const e of log) await updateEntry(e.id, { shared: true, pending: false });
      reload();
      if (r === 'copied') setToast(t('ask_copied'));
    }
  };
  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ app: 'ami-ama', exported: new Date().toISOString(), entries: log }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `so-ray-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  // P1: consented export of expert-labelled entries (the data flywheel). Local file only — never uploaded by the app.
  const labelled = log.filter((e) => e.expertLabel);
  const exportContrib = async () => {
    if (!labelled.length || !confirm(t('contrib_confirm'))) return;
    const data = {
      app: 'ami-ama',
      kind: 'contribution',
      version: 1,
      exported: new Date().toISOString(),
      note: 'Expert-labelled field observations, exported by the farmer with consent. Photos are 160 px thumbnails.',
      entries: labelled.map((e) => ({
        ts: e.ts, model: e.model, kind: e.kind, top: e.top, nLeaves: e.nLeaves, answers: e.answers, assisted: e.assisted,
        expertLabel: e.expertLabel, expertNote: e.expertNote, lat: e.lat, lng: e.lng,
        photos: e.photos?.length ? e.photos : e.thumb ? [e.thumb] : [],
      })),
    };
    const file = new File([JSON.stringify(data, null, 1)], `ami-ama-dong-gop-${new Date().toISOString().slice(0, 10)}.json`, {
      type: 'application/json',
    });
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        setToast(t('contrib_done', { n: labelled.length }));
        return;
      }
    } catch {
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setToast(t('contrib_done', { n: labelled.length }));
  };
  const title = (e: LogEntry) =>
    e.cardId === 'not_disease_nutrition'
      ? t('case_nutrition')
      : e.kind === 'predict' || e.kind === 'not_coffee' || e.assisted
        ? e.name
        : t('res_conf_low');

  return (
    <div className="screen log">
      <h1>{t('log_title')}</h1>
      {log.length === 0 && <p className="muted">{t('log_empty')}</p>}
      {log.length > 0 && (
        <div className="row">
          <button className="btn secondary" onClick={shareAll}>{t('log_share')}</button>
          <button className="btn secondary" onClick={downloadJson}>{t('log_json')}</button>
          {labelled.length > 0 && (
            <button className="btn secondary" onClick={exportContrib} data-testid="contrib-export">
              {t('contrib_export')} ({labelled.length})
            </button>
          )}
        </div>
      )}
      {log.length > 0 && (
        <div className="seg" role="group">
          <button className={`btn seg-btn ${!unsentOnly ? 'on' : ''}`} aria-pressed={!unsentOnly} onClick={() => setUnsentOnly(false)}>
            {t('log_filter_all')} ({log.length})
          </button>
          <button
            className={`btn seg-btn ${unsentOnly ? 'on' : ''}`}
            aria-pressed={unsentOnly}
            onClick={() => setUnsentOnly(true)}
            data-testid="filter-unsent"
          >
            {t('log_filter_unsent')} ({unsent})
          </button>
        </div>
      )}
      {toast && <p className="toast">{toast}</p>}
      <ul className="entries" data-testid="log-list">
        {shown.map((e) => {
          const pics = e.photos?.length ? e.photos : e.thumb ? [e.thumb] : [];
          return (
            <li key={e.id} className="entry" data-testid="log-entry">
              {pics.length ? <img src={pics[0]} alt="" width={80} height={80} /> : <div className="nothumb">🍃</div>}
              <div className="entry-body">
                <div className="entry-top">
                  <b>{title(e)}</b>
                  <span className={`badge ${e.shared ? 'ok' : 'pending'}`}>{e.shared ? t('log_sent') : t('log_pending')}</span>
                </div>
                <div className="muted small">
                  {fmtDate(e.ts)}
                  {e.kind !== 'abstain' && !e.assisted && ` · ${e.conf}`}
                  {e.assisted && ` · ${t('log_assisted')}`}
                  {e.nLeaves && e.nLeaves > 1 ? ` · ${t('log_leaves', { n: e.nLeaves })}` : ''}
                  {e.kind === 'abstain' && !e.assisted && e.maybe.length > 0 && ` · ${t('res_maybe')} ${e.maybe.join(` ${t('res_or')} `)}`}
                </div>
                {pics.length > 1 && (
                  <div className="mini-thumbs">
                    {pics.slice(1).map((p, i) => (
                      <img key={i} src={p} alt="" width={40} height={40} />
                    ))}
                  </div>
                )}
                {e.followUpAt && (
                  <div className="muted small" data-testid="follow-badge">
                    ⏰ {t('log_follow', { date: fmtDate(e.followUpAt) })}
                  </div>
                )}
                {e.parentId && <div className="muted small">↩︎ {t('log_follow_of')}</div>}
                <div className="muted small">📍 {e.lat != null ? `${e.lat}, ${e.lng}` : t('log_gps_none')}</div>
                <input
                  className="note"
                  placeholder={t('log_note')}
                  defaultValue={e.note}
                  onBlur={(ev) => updateEntry(e.id, { note: ev.target.value })}
                />
                <div className="row">
                  {!e.shared && (
                    <button className="btn small primary" onClick={() => go('ask', e.id)} data-testid="log-send">
                      {t('log_send')}
                    </button>
                  )}
                  <button className="btn small" onClick={() => go('ask', e.id)}>{t('log_ask')}</button>
                  <button className="btn small danger" onClick={async () => { await deleteEntry(e.id); reload(); }}>
                    {t('log_delete')}
                  </button>
                </div>
                <ExpertAnswer e={e} labels={labels} onSaved={reload} />
              </div>
            </li>
          );
        })}
      </ul>
      {log.length > 0 && (
        <button
          className="btn danger wide"
          onClick={async () => {
            if (confirm(t('log_confirm_delete_all'))) {
              await deleteLog();
              reload();
            }
          }}
        >
          {t('log_delete_all')}
        </button>
      )}
    </div>
  );
}
