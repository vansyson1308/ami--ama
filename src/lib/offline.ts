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
  if (missing.length === 0) return { state: 'ready' };
  const reg = await navigator.serviceWorker.getRegistration();
  // Install finished (or failed) but assets are still missing -> they will not arrive by waiting.
  const installDone = !!reg?.active && !reg.installing && !reg.waiting;
  // Registration exists but no worker at any stage: the install failed (e.g. a precache file 404'd).
  const installFailed = !!reg && !reg.active && !reg.installing && !reg.waiting;
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
  await reg?.update().catch(() => undefined);
}
