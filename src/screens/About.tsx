import { useState } from 'react';
import { t } from '../i18n';
import { deleteAll, saveSettings, type Settings } from '../lib/store';
import { ADVICE, QUESTIONS } from '../lib/content';

export default function About({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => void }) {
  const [msg, setMsg] = useState('');
  return (
    <div className="screen about">
      <h1>{t('about_title')}</h1>
      <p>{t('about_what')}</p>
      <h2>{t('about_private_t')}</h2>
      <ul className="dash">
        <li>{t('about_private_1')}</li>
        <li>{t('about_private_2')}</li>
        <li>{t('about_private_3')}</li>
      </ul>
      <h2>{t('about_consent_t')}</h2>
      <label className="toggle">
        <input type="checkbox" checked={settings.savePhotos} onChange={async (e) => onSettings(await saveSettings({ savePhotos: e.target.checked }))} />
        <span>{t('consent_photos')}</span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={settings.useGps} onChange={async (e) => onSettings(await saveSettings({ useGps: e.target.checked }))} />
        <span>{t('consent_gps')}</span>
      </label>
      <button
        className="btn danger wide"
        onClick={async () => {
          if (!confirm(t('log_confirm_delete_all'))) return;
          await deleteAll();
          setMsg(t('about_deleted'));
          setTimeout(() => location.reload(), 800);
        }}
      >
        {t('about_delete_all')}
      </button>
      {msg && <p className="toast">{msg}</p>}
      <h2>{t('about_questions_t')}</h2>
      <p className="muted small" data-testid="questions-review">{QUESTIONS.review_status}</p>
      <p className="muted small">{QUESTIONS.weights_note}</p>
      <p className="muted small">{ADVICE.review_status}</p>
      <h2>{t('about_lang_t')}</h2>
      <p>{t('about_lang')}</p>
      <h2>{t('about_team_t')}</h2>
      <p>{t('about_team')}</p>
      <p className="muted">{t('about_persona')}</p>
      <p className="muted small">{t('about_credits')}</p>
      <p className="muted small">{t('about_version')}: {__APP_VERSION__}</p>
    </div>
  );
}
