// Offline readiness: true when the service worker controls the page and the key assets are in Cache Storage.
export const REQUIRED = [
  '/index.html',
  '/models/leaf_v1.int8.onnx',
  '/models/model_card.json',
  '/models/labels.json',
  '/ort/ort-wasm-simd-threaded.wasm',
  '/audio/vi/uncertain.ogg',
  '/audio/vi/rust.ogg',
];

export async function offlineProgress(): Promise<number> {
  if (!('caches' in window) || !('serviceWorker' in navigator)) return -1;
  let hit = 0;
  for (const u of REQUIRED) if (await caches.match(u, { ignoreSearch: true })) hit++;
  return hit / REQUIRED.length;
}
