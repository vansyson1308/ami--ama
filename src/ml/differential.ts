// Tell-apart step ("Phân biệt"): fixed yes/no questions with draft likelihood ratios (content/questions.vi.json).
// Results changed by answers are "assisted" (theo dấu hiệu bạn thấy) — never "AI is sure".
export const COFFEE = ['healthy', 'rust', 'red_spider_mite', 'leaf_miner', 'cercospora', 'phoma'] as const;
export type CoffeeKey = (typeof COFFEE)[number];
export type Answer = 'yes' | 'no' | 'unsure';

export interface Question {
  id: string;
  for: string[];
  text: string;
  yes: Record<string, number>;
  no: Record<string, number>;
  flag?: string;
  sources: string[];
}

export const ASSIST_MIN = 0.85;
export const NUTRITION_Q = 'q_uniform_yellow';
export const MITE_Q = 'q_mite_seen';

/** Model probabilities (all 7 classes, keyed) -> distribution over the 6 coffee classes. */
export function coffeePrior(probs: Record<string, number>): Record<CoffeeKey, number> {
  const out = {} as Record<CoffeeKey, number>;
  let s = 0;
  for (const k of COFFEE) s += probs[k] ?? 0;
  for (const k of COFFEE) out[k] = s > 0 ? (probs[k] ?? 0) / s : 1 / COFFEE.length;
  return out;
}

/** Top-2 coffee candidates (never not_coffee_leaf). */
export function candidates(prior: Record<CoffeeKey, number>): [CoffeeKey, CoffeeKey] {
  const s = [...COFFEE].sort((a, b) => prior[b] - prior[a]);
  return [s[0], s[1]];
}

/** Questions for the top-2: top-1's first, then top-2's, then the nutrition question last; at most `max`. */
export function selectQuestions(cands: [CoffeeKey, CoffeeKey], qs: Question[], max = 3): Question[] {
  const pick: Question[] = [];
  const add = (q?: Question) => q && !pick.includes(q) && pick.push(q);
  const forC = (c: string) => qs.filter((q) => q.for.includes(c));
  // one question per candidate first, so both candidates get asked about
  add(forC(cands[0])[0]);
  add(forC(cands[1])[0]);
  const nutrition = qs.find((q) => q.id === NUTRITION_Q);
  for (const q of [...forC(cands[0]), ...forC(cands[1])]) if (pick.length < max - (nutrition ? 1 : 0)) add(q);
  if (nutrition) add(nutrition);
  return pick.slice(0, max);
}

/** Posterior ∝ prior × Π likelihood ratios ("không rõ" = 1). */
export function update(prior: Record<CoffeeKey, number>, answers: Record<string, Answer>, qs: Question[]) {
  const post = { ...prior };
  for (const q of qs) {
    const a = answers[q.id];
    if (!a || a === 'unsure') continue;
    const lr = a === 'yes' ? q.yes : q.no;
    for (const k of COFFEE) post[k] *= lr[k] ?? 1;
  }
  const s = COFFEE.reduce((acc, k) => acc + post[k], 0);
  for (const k of COFFEE) post[k] = s > 0 ? post[k] / s : 0;
  return post;
}

export type Outcome =
  | { kind: 'assisted'; key: CoffeeKey; posterior: Record<CoffeeKey, number> }
  | { kind: 'nutrition'; posterior: Record<CoffeeKey, number> }
  | { kind: 'uncertain'; posterior: Record<CoffeeKey, number> };

/** An answer supports class k when its likelihood ratio for k is > 1 (e.g. "no" to q_any_sign supports healthy). */
function supports(q: Question, a: Answer, k: string): boolean {
  if (a === 'unsure') return false;
  return ((a === 'yes' ? q.yes : q.no)[k] ?? 1) > 1;
}

export function outcome(prior: Record<CoffeeKey, number>, answers: Record<string, Answer>, qs: Question[]): Outcome {
  const posterior = update(prior, answers, qs);
  // Nutrition: uniform yellowing reported and no disease-sign question answered "yes".
  const signYes = qs.some((q) => q.id !== NUTRITION_Q && answers[q.id] === 'yes');
  if (answers[NUTRITION_Q] === 'yes' && !signYes) return { kind: 'nutrition', posterior };
  const top = [...COFFEE].sort((a, b) => posterior[b] - posterior[a])[0];
  const supported = qs.some((q) => answers[q.id] && supports(q, answers[q.id], top));
  // Safety: red spider mite only when the farmer actually saw mites/eggs/webbing.
  const miteOk = top !== 'red_spider_mite' || answers[MITE_Q] === 'yes';
  if (posterior[top] >= ASSIST_MIN && supported && miteOk) return { kind: 'assisted', key: top, posterior };
  return { kind: 'uncertain', posterior };
}
