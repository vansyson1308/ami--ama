// Offline readiness: the service worker controls the page and every asset the core loop needs is in Cache Storage
// (Workbox precache, or the 'ami-runtime' cache filled by a retry — the SW serves both offline).
export const REQUIRED = [
  '/index.html',
  '/models/leaf_v1.int8.onnx',
  '/models/model_card.json',
  '/models/labels.json',
  '/ort/ort-wasm-simd-threaded.wasm',
  '/ort/ort-wasm-simd-threaded.mjs',
  '/audio/vi/uncertain.ogg',
  '/audio/vi/rust.ogg',
];
export const RUNTIME_CACHE = 'ami-runtime';

export type OfflineState =
  | { state: 'unsupported' }
  | { state: 'ready' }
  | { state: 'loading'; progress: number }
  | { state: 'need-network'; progress: number; missing: string[] }
  | { state: 'error'; progress: number; missing: string[] };

async function missingAssets(): Promise<string[]> {
  const out: string[] = [];
  for (const u of REQUIRED) if (!(await caches.match(u, { ignoreSearch: true }))) out.push(u);
  return out;
}

/** One status check. `stalled` = the caller saw no progress for a long time while loading. */
export async function offlineStatus(stalled = false): Promise<OfflineState> {
  if (!('caches' in window) || !('serviceWorker' in navigator)) return { state: 'unsupported' };
  const missing = await missingAssets();
  const progress = (REQUIRED.length - missing.length) / REQUIRED.length;
  const reg = await navigator.serviceWorker.getRegistration();
  // "Ready" means truly usable offline: every asset cached AND a service worker controls this page.
  const installDone = !!reg?.active && !reg.installing && !reg.waiting;
  // Install failed (e.g. a precache file 404'd): the browser drops a registration whose first install fails,
  // so "no registration a few seconds after load" means failed too (registerSW runs immediately on load).
  const installFailed = reg ? !reg.active && !reg.installing && !reg.waiting : performance.now() > 8000;
  if (missing.length === 0) {
    if (navigator.serviceWorker.controller) return { state: 'ready' };
    // Files are cached but no worker controls the page yet (activating / claiming): wait, unless it is stuck.
    if (installFailed || stalled) return { state: 'error', progress: 1, missing: ['service worker'] };
    return { state: 'loading', progress: 0.99 };
  }
  // Install finished (or failed) but assets are still missing -> they will not arrive by waiting.
  if (installDone || installFailed || stalled) {
    return navigator.onLine ? { state: 'error', progress, missing } : { state: 'need-network', progress, missing };
  }
  if (!navigator.onLine) return { state: 'need-network', progress, missing };
  return { state: 'loading', progress };
}

/** Retry: fetch each missing asset into the runtime cache, then ask the SW to update itself. */
export async function retryOffline(missing: string[]): Promise<void> {
  const cache = await caches.open(RUNTIME_CACHE);
  await Promise.all(
    missing.map(async (u) => {
      try {
        const r = await fetch(u, { cache: 'reload' });
        if (r.ok) await cache.put(u, r);
      } catch {
        /* still offline or 404 — the badge stays in the error state */
      }
    }),
  );
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) await reg.update().catch(() => undefined);
  else await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
}
