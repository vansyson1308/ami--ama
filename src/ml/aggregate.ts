// Plant check (lần khám): combine 1–3 leaves of the SAME tree. MUST match ml/common.py::aggregate.
//
// Rule: average the temperature-scaled logits (logits / T) over the images that passed the quality gate, softmax,
// then apply the unchanged decide() (same tau, margin, never_assert). We do NOT multiply per-image probabilities:
// leaves of one tree are correlated, so a product would overstate confidence.
// Extra rule with 2–3 images: abstain unless at least 2 per-image top-1 labels agree.
// With exactly 1 image this reduces to the single-image path (same probabilities, same decision).
import { decide, type Decision } from './decide';

export interface LeafInput {
  logits?: number[]; // undefined when the image failed the quality gate
  ok: boolean; // passed the quality gate
}

export interface Aggregated {
  decision: Decision; // 'retake' when no image passed the gate
  probs?: number[];
  used: number; // images used
  skipped: number; // images skipped by the quality gate
  agree: number; // max number of per-image top-1 labels that agree
  disagree: boolean; // 2–3 images and fewer than 2 agree -> forced abstain
}

function argmax(a: number[]): number {
  let b = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[b]) b = i;
  return b;
}

export function aggregate(
  leaves: LeafInput[],
  temperature: number,
  tau: number,
  margin: number,
  notCoffeeId: number,
  neverAssert: number[] = [],
): Aggregated {
  const ok = leaves.filter((l) => l.ok && l.logits);
  const skipped = leaves.length - ok.length;
  if (ok.length === 0) return { decision: { kind: 'retake', reason: 'blur' }, used: 0, skipped, agree: 0, disagree: false };
  const k = ok[0].logits!.length;
  const mean = new Array(k).fill(0);
  for (const l of ok) for (let i = 0; i < k; i++) mean[i] += l.logits![i] / temperature / ok.length;
  const m = Math.max(...mean);
  const e = mean.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  const probs = e.map((v) => v / s);
  const tops = ok.map((l) => argmax(l.logits!));
  const counts = new Map<number, number>();
  for (const t of tops) counts.set(t, (counts.get(t) ?? 0) + 1);
  const agree = Math.max(...counts.values());
  let decision = decide(probs, tau, margin, notCoffeeId, neverAssert);
  const disagree = ok.length >= 2 && agree < 2;
  if (disagree && (decision.kind === 'predict' || decision.kind === 'not_coffee')) decision = { kind: 'abstain', top: decision.top, probs };
  return { decision, probs, used: ok.length, skipped, agree, disagree };
}

export type AbstainReason = 'quality' | 'not_coffee' | 'ambiguous' | 'unknown';

/** Why we could not give an answer — each reason has its own next step in the UI. */
export function reasonOf(d: Decision, tau: number, margin: number, disagree = false): AbstainReason | undefined {
  if (d.kind === 'retake') return 'quality';
  if (d.kind === 'not_coffee') return 'not_coffee';
  if (d.kind !== 'abstain') return undefined;
  const [t1, t2] = d.top;
  const p1 = d.probs[t1];
  if (d.gated || disagree) return 'ambiguous';
  if (p1 >= tau && p1 - d.probs[t2] < margin) return 'ambiguous';
  return 'unknown';
}
