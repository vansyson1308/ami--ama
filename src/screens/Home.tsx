import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { getLog, type LogEntry } from '../lib/store';
import { go } from '../App';
import { Listen } from '../components';
import { ADVICE } from '../lib/content';

export default function Home() {
  // v1.1 local follow-up reminders (no push/notification permission): entries whose followUpAt has passed.
  const [due, setDue] = useState<LogEntry[]>([]);
  useEffect(() => {
    getLog().then((l) => setDue(l.filter((e) => e.followUpAt && e.followUpAt <= Date.now())));
  }, []);
  return (
    <div className="screen home">
      {due.length > 0 && (
        <button className="banner" onClick={() => go('capture', `f-${due[0].id}`)} data-testid="follow-banner">
          ⏰ {t('follow_banner', { n: due.length })}
        </button>
      )}
      <p className="tagline">{t('tagline')}</p>
      <div className="tiles">
        <button className="tile t-capture" onClick={() => go('capture')}>
          <span className="ticon" aria-hidden>📷</span>
          <span>{t('tile_capture')}</span>
        </button>
        <button className="tile t-log" onClick={() => go('log')}>
          <span className="ticon" aria-hidden>📒</span>
          <span>{t('tile_log')}</span>
        </button>
        <button className="tile t-prices" onClick={() => go('prices')}>
          <span className="ticon" aria-hidden>💰</span>
          <span>{t('tile_prices')}</span>
        </button>
        <button className="tile t-ask" onClick={() => go('ask')}>
          <span className="ticon" aria-hidden>🙋</span>
          <span>{t('tile_ask')}</span>
        </button>
      </div>
      <button className="btn secondary wide" onClick={() => go('samples')}>
        🍃 {t('link_samples')}
      </button>
      <div className="row">
        <Listen id="welcome" text={ADVICE.ui_prompts.welcome} />
      </div>
      <nav className="links">
        <a href="#/evidence">📊 {t('link_evidence')}</a>
        <a href="#/about">ℹ️ {t('link_about')}</a>
      </nav>
    </div>
  );
}
