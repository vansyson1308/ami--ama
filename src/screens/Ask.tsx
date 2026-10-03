import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { fmtDate, Listen } from '../components';
import { ADVICE } from '../lib/content';
import { getLog, saveSettings, updateEntry, type LogEntry, type Settings } from '../lib/store';
import { entryMessage, shareText, smsHref } from '../lib/message';

export default function Ask({ entryId, settings, onSettings }: { entryId?: string; settings: Settings; onSettings: (s: Settings) => void }) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [sel, setSel] = useState<string>('');
  const [msg, setMsg] = useState('');
  const [phone, setPhone] = useState(settings.officerPhone);
  const [toast, setToast] = useState('');

  useEffect(() => {
    getLog().then((l) => {
      setLog(l);
      const id = entryId && l.some((e) => e.id === entryId) ? entryId : (l[0]?.id ?? '');
      setSel(id);
      setMsg(entryMessage(l.find((e) => e.id === id)));
    });
  }, [entryId]);

  const choose = (id: string) => {
    setSel(id);
    setMsg(entryMessage(log.find((e) => e.id === id)));
  };
  const markSent = async () => {
    if (sel) await updateEntry(sel, { shared: true });
  };
  const entry = log.find((e) => e.id === sel);

  return (
    <div className="screen ask">
      <h1>{t('ask_title')}</h1>
      <p>{t('ask_intro')}</p>
      <Listen id="ask_person" text={ADVICE.ui_prompts.ask_person} />
      <label className="field">
        <span>{t('ask_pick')}</span>
        <select value={sel} onChange={(e) => choose(e.target.value)} data-testid="ask-pick">
          <option value="">{t('ask_none')}</option>
          {log.map((e) => (
            <option key={e.id} value={e.id}>
              {fmtDate(e.ts)} — {e.kind === 'predict' ? e.name : t('res_conf_low')}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t('ask_phone')}</span>
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={async () => onSettings(await saveSettings({ officerPhone: phone }))}
        />
      </label>
      <label className="field">
        <span>{t('ask_message')}</span>
        <textarea rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} data-testid="ask-msg" />
      </label>
      <a className="btn primary big" href={smsHref(phone, msg)} onClick={markSent} data-testid="sms-link">
        {t('ask_sms')}
      </a>
      <button
        className="btn secondary wide"
        onClick={async () => {
          const r = await shareText(msg, entry?.thumb);
          if (r !== 'failed') await markSent();
          if (r === 'copied') setToast(t('ask_copied'));
        }}
      >
        {t('ask_share')}
      </button>
      {toast && <p className="toast">{toast}</p>}
    </div>
  );
}
