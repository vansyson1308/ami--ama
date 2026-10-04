import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from './i18n';
import { getSettings, type Settings } from './lib/store';
import { offlineStatus, retryOffline, type OfflineState } from './lib/offline';
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

export const MAX_LEAVES = 3;
export interface Leaf {
  analysis: Analysis;
  photo: string;
}
export interface Check {
  leaves: Leaf[];
  parentId?: string;
}
export type CaptureMode = { kind: 'new' } | { kind: 'add'; n: number } | { kind: 'follow'; id: string };

function captureMode(arg: string | undefined, check: Check | null): CaptureMode {
  if (arg === 'add' && check && check.leaves.length < MAX_LEAVES) return { kind: 'add', n: check.leaves.length + 1 };
  if (arg?.startsWith('f-')) return { kind: 'follow', id: arg.slice(2) };
  return { kind: 'new' };
}

export function go(route: Route, arg?: string) {
  location.hash = `#/${route}${arg ? '/' + arg : ''}`;
}

const STALL_MS = 45_000;

function OfflineBadge() {
  const [st, setSt] = useState<OfflineState | null>(null);
  const [retrying, setRetrying] = useState(false);
  const timer = useRef<number>(0);
  const last = useRef({ progress: -1, at: Date.now() });

  const tick = useCallback(async () => {
    window.clearTimeout(timer.current);
    const stalled = Date.now() - last.current.at > STALL_MS;
    const v = await offlineStatus(stalled);
    if ('progress' in v && v.progress !== last.current.progress) last.current = { progress: v.progress, at: Date.now() };
    setSt(v);
    if (v.state === 'loading') timer.current = window.setTimeout(tick, 1000);
    else if (v.state === 'error' || v.state === 'need-network') timer.current = window.setTimeout(tick, 10_000);
  }, []);

  useEffect(() => {
    tick();
    const sw = navigator.serviceWorker;
    sw?.addEventListener('controllerchange', tick);
    window.addEventListener('online', tick);
    window.addEventListener('offline', tick);
    return () => {
      window.clearTimeout(timer.current);
      sw?.removeEventListener('controllerchange', tick);
      window.removeEventListener('online', tick);
      window.removeEventListener('offline', tick);
    };
  }, [tick]);

  if (!st) return null;
  if (st.state === 'unsupported') return <span className="badge warn">{t('offline_unsupported')}</span>;
  if (st.state === 'ready')
    return (
      <span className="badge ok" data-testid="offline-ready">
        {t('offline_ready')}
      </span>
    );
  if (st.state === 'loading')
    return (
      <span className="badge" data-testid="offline-loading">
        {t('offline_loading')} {Math.round(st.progress * 100)}%
      </span>
    );
  if (st.state === 'need-network')
    return (
      <span className="badge warn" data-testid="offline-need-network" title={st.missing.join(', ')}>
        {t('offline_need_network')} ({Math.round(st.progress * 100)}%)
      </span>
    );
  return (
    <button
      className="badge warn badge-btn"
      data-testid="offline-error"
      title={st.missing.join(', ')}
      disabled={retrying}
      onClick={async () => {
        setRetrying(true);
        last.current = { progress: -1, at: Date.now() };
        await retryOffline(st.missing);
        setRetrying(false);
        tick();
      }}
    >
      {retrying ? t('offline_retrying') : `${t('offline_error')} — ${t('offline_retry')}`}
    </button>
  );
}

export default function App() {
  const [{ route, arg }, setR] = useState(readRoute());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [check, setCheck] = useState<Check | null>(null);

  useEffect(() => {
    const on = () => {
      setR(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    getSettings().then(setSettings);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  // v1.1 plant check: 'add' appends a leaf (max 3) to the current check; 'f-<id>' starts a follow-up of a log entry.
  const onAnalysis = useCallback((a: Analysis, photoUrl: string, mode: CaptureMode) => {
    setCheck((prev) =>
      mode.kind === 'add' && prev
        ? { ...prev, leaves: [...prev.leaves, { analysis: a, photo: photoUrl }].slice(0, MAX_LEAVES) }
        : { leaves: [{ analysis: a, photo: photoUrl }], parentId: mode.kind === 'follow' ? mode.id : undefined },
    );
    go('result');
  }, []);
  const mode = captureMode(arg, check);

  if (!settings) return null;

  let body;
  if (!settings.onboarded) body = <Onboarding onDone={setSettings} />;
  else if (route === 'capture') body = <Capture mode={mode} onAnalysis={(a, u) => onAnalysis(a, u, mode)} />;
  else if (route === 'samples') body = <Samples mode={mode} onAnalysis={(a, u) => onAnalysis(a, u, mode)} />;
  else if (route === 'result' && check) body = <Result check={check} settings={settings} />;
  else if (route === 'log') body = <FieldLog />;
  else if (route === 'ask') body = <Ask entryId={arg} settings={settings} onSettings={setSettings} />;
  else if (route === 'prices') body = <Prices />;
  else if (route === 'evidence') body = <Evidence />;
  else if (route === 'about') body = <About settings={settings} onSettings={setSettings} />;
  else body = <Home />;

  const isHome = !settings.onboarded || route === 'home' || (route === 'result' && !check);
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
