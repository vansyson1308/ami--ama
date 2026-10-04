import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { fmtDate, Listen } from '../components';
import { ADVICE } from '../lib/content';
import { getLog, saveSettings, updateEntry, type Contact, type LogEntry, type Settings } from '../lib/store';
import { entryMessage, smsHref } from '../lib/message';
import { buildCaseImage } from '../lib/caseImage';

const MAX_CONTACTS = 2;

export default function Ask({ entryId, settings, onSettings }: { entryId?: string; settings: Settings; onSettings: (s: Settings) => void }) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [sel, setSel] = useState<string>('');
  const [msg, setMsg] = useState('');
  const [contacts, setContacts] = useState<Contact[]>(() => {
    const c = [...(settings.contacts ?? [])];
    while (c.length < MAX_CONTACTS) c.push({ name: '', phone: '' });
    return c.slice(0, MAX_CONTACTS);
  });
  const [to, setTo] = useState(0);
  const [toast, setToast] = useState('');
  const [caseUrl, setCaseUrl] = useState<string | null>(null);
  const [caseBlob, setCaseBlob] = useState<Blob | null>(null);

  useEffect(() => {
    getLog().then((l) => {
      setLog(l);
      const id = entryId && l.some((e) => e.id === entryId) ? entryId : (l[0]?.id ?? '');
      setSel(id);
      setMsg(entryMessage(l.find((e) => e.id === id)));
    });
  }, [entryId]);

  const entry = log.find((e) => e.id === sel);
  // (re)build the case image whenever the chosen entry changes — fully offline, canvas -> JPEG
  useEffect(() => {
    let url: string | null = null;
    setCaseBlob(null);
    setCaseUrl(null);
    if (!entry) return;
    buildCaseImage(entry).then((b) => {
      url = URL.createObjectURL(b);
      setCaseBlob(b);
      setCaseUrl(url);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [entry]);

  const choose = (id: string) => {
    setSel(id);
    setMsg(entryMessage(log.find((e) => e.id === id)));
  };
  const markSent = async () => {
    if (sel) await updateEntry(sel, { shared: true, pending: false });
  };
  const saveContacts = async (c: Contact[]) => {
    const clean = c.filter((x) => x.name.trim() || x.phone.trim());
    onSettings(await saveSettings({ contacts: clean, officerPhone: clean[0]?.phone ?? '' }));
  };
  const phone = contacts[to]?.phone ?? '';

  const sendCase = async () => {
    const file = caseBlob ? new File([caseBlob], `phieu-hoi-${new Date().toISOString().slice(0, 10)}.jpg`, { type: 'image/jpeg' }) : null;
    try {
      if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: msg });
        await markSent();
        return;
      }
      if (!file && navigator.share) {
        await navigator.share({ text: msg });
        await markSent();
        return;
      }
    } catch {
      return; // user cancelled the share sheet
    }
    // Fallback: download the case image + copy the text, then the farmer pastes it into Zalo.
    if (file) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    try {
      await navigator.clipboard.writeText(msg);
    } catch {
      /* clipboard may be unavailable; the text is still visible below */
    }
    setToast(t('ask_case_saved'));
    await markSent();
  };

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
              {fmtDate(e.ts)} — {e.kind === 'predict' || e.assisted ? e.name : e.kind === 'not_coffee' ? e.name : t('res_conf_low')}
              {e.shared ? '' : ` · ${t('log_pending')}`}
            </option>
          ))}
        </select>
      </label>
      {caseUrl && (
        <figure className="case-preview">
          <figcaption className="muted small">{t('ask_case_preview')}</figcaption>
          <img src={caseUrl} alt={t('ask_case_preview')} data-testid="case-img" data-bytes={caseBlob?.size} />
        </figure>
      )}
      <label className="field">
        <span>{t('ask_message')}</span>
        <textarea rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} data-testid="ask-msg" />
      </label>
      <button className="btn primary big" onClick={sendCase} data-testid="send-zalo">
        {t('ask_send_case')}
      </button>
      {toast && (
        <p className="toast" data-testid="toast">
          {toast}
        </p>
      )}
      <fieldset className="contacts">
        <legend>{t('ask_contacts')}</legend>
        {contacts.map((c, i) => (
          <div key={i} className="contact-row">
            <input type="radio" name="to" checked={to === i} onChange={() => setTo(i)} aria-label={c.name || `${i + 1}`} />
            <input
              placeholder={t('ask_contact_name')}
              value={c.name}
              data-testid={`contact-name-${i}`}
              onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              onBlur={() => saveContacts(contacts)}
            />
            <input
              type="tel"
              inputMode="tel"
              placeholder={t('ask_contact_phone')}
              value={c.phone}
              data-testid={`contact-phone-${i}`}
              onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))}
              onBlur={() => saveContacts(contacts)}
            />
          </div>
        ))}
      </fieldset>
      <div className="row">
        <a className="btn secondary" href={smsHref(phone, msg)} onClick={markSent} data-testid="sms-link">
          {t('ask_sms')}
        </a>
        <a className="btn secondary" href={`tel:${phone.replace(/[^\d+]/g, '')}`} data-testid="call-link">
          {t('ask_call')}
        </a>
      </div>
    </div>
  );
}
