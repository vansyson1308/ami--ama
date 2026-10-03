import { useCallback, useEffect, useState } from 'react';
import { t } from './i18n';
import { getSettings, type Settings } from './lib/store';
import { offlineProgress } from './lib/offline';
import type { Analysis } from './ml/model';
import Onboarding from './screens/Onboarding';
import Home from './screens/Home';
import Capture from './screens/Capture';
import Samples from './screens/Samples';
import Result from './screens/Result';
import FieldLog from './screens/FieldLog';
import Ask from './screens/Ask';
import Prices from './screens/Prices';
import Evidence from './screens/Evidence';
import About from './screens/About';

export type Route = 'home' | 'capture' | 'samples' | 'result' | 'log' | 'ask' | 'prices' | 'evidence' | 'about';

function readRoute(): { route: Route; arg?: string } {
  const [r, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const route = (r || 'home') as Route;
  return { route, arg };
}

export function go(route: Route, arg?: string) {
  location.hash = `#/${route}${arg ? '/' + arg : ''}`;
}

function OfflineBadge() {
  const [p, setP] = useState<number | null>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const v = await offlineProgress();
      if (stop) return;
      setP(v);
      if (v < 1 && v >= 0) setTimeout(tick, 1000);
    };
    tick();
    navigator.serviceWorker?.addEventListener('controllerchange', tick);
    return () => {
      stop = true;
    };
  }, []);
  if (p === null) return null;
  if (p < 0) return <span className="badge warn">{t('offline_unsupported')}</span>;
  if (p >= 1)
    return (
      <span className="badge ok" data-testid="offline-ready">
        {t('offline_ready')}
      </span>
    );
  return (
    <span className="badge">
      {t('offline_loading')} {Math.round(p * 100)}%
    </span>
  );
}

export default function App() {
  const [{ route, arg }, setR] = useState(readRoute());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    const on = () => {
      setR(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    getSettings().then(setSettings);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const onAnalysis = useCallback((a: Analysis, photoUrl: string) => {
    setAnalysis(a);
    setPhoto(photoUrl);
    go('result');
  }, []);

  if (!settings) return null;

  let body;
  if (!settings.onboarded) body = <Onboarding onDone={setSettings} />;
  else if (route === 'capture') body = <Capture onAnalysis={onAnalysis} />;
  else if (route === 'samples') body = <Samples onAnalysis={onAnalysis} />;
  else if (route === 'result' && analysis)
    body = <Result analysis={analysis} photo={photo} settings={settings} />;
  else if (route === 'log') body = <FieldLog />;
  else if (route === 'ask') body = <Ask entryId={arg} settings={settings} onSettings={setSettings} />;
  else if (route === 'prices') body = <Prices />;
  else if (route === 'evidence') body = <Evidence />;
  else if (route === 'about') body = <About settings={settings} onSettings={setSettings} />;
  else body = <Home />;

  const isHome = !settings.onboarded || route === 'home' || (route === 'result' && !analysis);
  return (
    <div className="app">
      <header className="top">
        {isHome ? (
          <span className="brand">🌿 {t('app_name')}</span>
        ) : (
          <button className="backbtn" onClick={() => history.length > 1 ? history.back() : go('home')}>
            {t('back')}
          </button>
        )}
        <OfflineBadge />
      </header>
      <main>{body}</main>
    </div>
  );
}
