import { t } from '../i18n';
import { go } from '../App';
import { Listen } from '../components';
import { ADVICE } from '../lib/content';

export default function Home() {
  return (
    <div className="screen home">
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
