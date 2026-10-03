import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { go } from '../App';
import { fmtDate } from '../components';
import { deleteEntry, deleteLog, getLog, updateEntry, type LogEntry } from '../lib/store';
import { entryMessage, shareText } from '../lib/message';

export default function FieldLog() {
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [toast, setToast] = useState('');
  const reload = () => getLog().then(setLog);
  useEffect(() => {
    reload();
  }, []);
  if (!log) return null;

  const shareAll = async () => {
    const text = log.map((e) => entryMessage(e)).join('\n');
    const r = await shareText(text || t('ask_general'));
    if (r !== 'failed') {
      for (const e of log) await updateEntry(e.id, { shared: true });
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

  return (
    <div className="screen log">
      <h1>{t('log_title')}</h1>
      {log.length === 0 && <p className="muted">{t('log_empty')}</p>}
      {log.length > 0 && (
        <div className="row">
          <button className="btn secondary" onClick={shareAll}>{t('log_share')}</button>
          <button className="btn secondary" onClick={downloadJson}>{t('log_json')}</button>
        </div>
      )}
      {toast && <p className="toast">{toast}</p>}
      <ul className="entries" data-testid="log-list">
        {log.map((e) => (
          <li key={e.id} className="entry" data-testid="log-entry">
            {e.thumb ? <img src={e.thumb} alt="" width={80} height={80} /> : <div className="nothumb">🍃</div>}
            <div className="entry-body">
              <div className="entry-top">
                <b>{e.kind === 'predict' ? e.name : e.kind === 'not_coffee' ? e.name : t('res_conf_low')}</b>
                <span className={`badge ${e.shared ? 'ok' : 'pending'}`}>{e.shared ? t('log_sent') : t('log_pending')}</span>
              </div>
              <div className="muted small">
                {fmtDate(e.ts)} · {e.conf}
                {e.maybe.length > 0 && ` · ${t('res_maybe')} ${e.maybe.join(` ${t('res_or')} `)}`}
              </div>
              <div className="muted small">📍 {e.lat != null ? `${e.lat}, ${e.lng}` : t('log_gps_none')}</div>
              <input
                className="note"
                placeholder={t('log_note')}
                defaultValue={e.note}
                onBlur={(ev) => updateEntry(e.id, { note: ev.target.value })}
              />
              <div className="row">
                <button className="btn small" onClick={() => go('ask', e.id)}>{t('log_ask')}</button>
                <button className="btn small danger" onClick={async () => { await deleteEntry(e.id); reload(); }}>
                  {t('log_delete')}
                </button>
              </div>
            </div>
          </li>
        ))}
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
