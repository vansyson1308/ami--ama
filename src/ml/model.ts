import * as ort from 'onnxruntime-web/wasm';
import { cropSquare, loadBitmap, SIZE, thumbnail, toTensorData } from './preprocess';
import { checkQuality, type QualityResult } from './quality';
import { decide, softmax, type Decision } from './decide';

// The WASM runtime is served from our own origin (public/ort/), precached by the service worker.
ort.env.wasm.wasmPaths = '/ort/';
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

export interface Label {
  id: number;
  key: string;
  vi_name: string;
  card_id: string;
}

export interface ModelCard {
  version: string;
  arch: string;
  file: string;
  temperature: number;
  tau: number;
  margin: number;
  never_assert?: string[];
  size_bytes: number;
  sha256: string;
  metrics: Record<string, Record<string, number>>;
  [k: string]: unknown;
}

let sessionP: Promise<ort.InferenceSession> | null = null;
let metaP: Promise<{ card: ModelCard; labels: Label[] }> | null = null;

export function loadMeta() {
  metaP ??= Promise.all([
    fetch('/models/model_card.json').then((r) => r.json()),
    fetch('/models/labels.json').then((r) => r.json()),
  ]).then(([card, labels]) => ({ card, labels }));
  return metaP;
}

export function loadSession() {
  sessionP ??= loadMeta().then(({ card }) =>
    ort.InferenceSession.create(`/models/${card.file}`, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }),
  );
  return sessionP;
}

export interface Analysis {
  decision: Decision;
  quality: QualityResult;
  thumb: string;
  ms: number;
  logits?: number[];
}

export async function analyze(src: Blob | string, opts: { skipQuality?: boolean } = {}): Promise<Analysis> {
  const bmp = await loadBitmap(src);
  const quality = checkQuality(bmp);
  const thumb = thumbnail(bmp);
  if (!quality.ok && !opts.skipQuality) {
    return { decision: { kind: 'retake', reason: quality.reason! }, quality, thumb, ms: 0 };
  }
  const [{ card, labels }, session] = await Promise.all([loadMeta(), loadSession()]);
  const t0 = performance.now();
  const input = new ort.Tensor('float32', toTensorData(cropSquare(bmp, SIZE)), [1, 3, SIZE, SIZE]);
  const out = await session.run({ input });
  const logits = Array.from(out.logits.data as Float32Array);
  const probs = softmax(logits, card.temperature);
  const notCoffee = labels.find((l) => l.key === 'not_coffee_leaf')!.id;
  const neverAssert = (card.never_assert ?? []).map((k) => labels.find((l) => l.key === k)!.id);
  const decision = decide(probs, card.tau, card.margin, notCoffee, neverAssert);
  return { decision, quality, thumb, ms: performance.now() - t0, logits };
}
