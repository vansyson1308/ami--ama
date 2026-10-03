// Runtime decision rule — MUST match ml/common.py::decide (SPEC §5.5).
export type Decision =
  | { kind: 'retake'; reason: 'dark' | 'bright' | 'blur' }
  | { kind: 'not_coffee'; top: number[]; probs: number[] }
  | { kind: 'abstain'; top: number[]; probs: number[] }
  | { kind: 'predict'; top: number[]; probs: number[] };

export function softmax(logits: ArrayLike<number>, temperature: number): number[] {
  const z = Array.from(logits, (v) => v / temperature);
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export function decide(probs: number[], tau: number, margin: number, notCoffeeId: number): Decision {
  const top = probs.map((_, i) => i).sort((a, b) => probs[b] - probs[a]);
  const [t1, t2] = top;
  const p1 = probs[t1];
  const p2 = probs[t2];
  if (t1 === notCoffeeId && p1 >= tau) return { kind: 'not_coffee', top, probs };
  if (p1 < tau || p1 - p2 < margin) return { kind: 'abstain', top, probs };
  return { kind: 'predict', top, probs };
}

export type ConfLevel = 'high' | 'mid' | 'low';
export function confLevel(p: number, tau: number): ConfLevel {
  if (p >= 0.9) return 'high';
  if (p >= tau) return 'mid';
  return 'low';
}
