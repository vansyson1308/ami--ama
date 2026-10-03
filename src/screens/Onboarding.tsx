import { useState } from 'react';
import { t } from '../i18n';
import { saveSettings, type Settings } from '../lib/store';
import { Listen } from '../components';
import { ADVICE } from '../lib/content';

export default function Onboarding({ onDone }: { onDone: (s: Settings) => void }) {
  const [photos, setPhotos] = useState(false);
  const [gps, setGps] = useState(false);
  return (
    <div className="screen onboarding">
      <h1>{t('onb_title')}</h1>
      <Listen id="welcome" text={ADVICE.ui_prompts.welcome} />
      <ul className="big-list">
        <li>📷 {t('onb_1')}</li>
        <li>📶 {t('onb_2')}</li>
        <li>🔒 {t('onb_3')}</li>
        <li>🙋 {t('onb_4')}</li>
      </ul>
      <label className="toggle">
        <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} data-testid="consent-photos" />
        <span>{t('consent_photos')}</span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={gps} onChange={(e) => setGps(e.target.checked)} data-testid="consent-gps" />
        <span>{t('consent_gps')}</span>
      </label>
      <p className="muted">{t('consent_note')}</p>
      <button
        className="btn primary big"
        onClick={async () => onDone(await saveSettings({ onboarded: true, savePhotos: photos, useGps: gps }))}
      >
        {t('start')}
      </button>
    </div>
  );
}
