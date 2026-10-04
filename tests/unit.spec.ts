// Unit tests for the pure v1.1 functions (run in Node by the Playwright runner — no browser, no new dependency).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { aggregate, reasonOf } from '../src/ml/aggregate';
import { decide, softmax } from '../src/ml/decide';
import {
  candidates,
  coffeePrior,
  outcome,
  selectQuestions,
  update,
  type Answer,
  type Question,
} from '../src/ml/differential';

const card = JSON.parse(readFileSync('public/models/model_card.json', 'utf8'));
const labels: { key: string }[] = JSON.parse(readFileSync('public/models/labels.json', 'utf8'));
const KEYS = labels.map((l) => l.key);
const ID = Object.fromEntries(KEYS.map((k, i) => [k, i]));
const NC = ID.not_coffee_leaf;
const NEVER = (card.never_assert ?? []).map((k: string) => ID[k]);
const QS: Question[] = JSON.parse(readFileSync('content/questions.vi.json', 'utf8')).questions;
const expected: Record<string, { probs: number[]; decision: string }> = JSON.parse(
  readFileSync('tests/fixtures/expected.json', 'utf8'),
);

// logits that reproduce given probabilities after /T + softmax
const logitsFor = (p: number[], T: number) => p.map((v) => T * Math.log(Math.max(v, 1e-12)));
const keyed = (p: number[]) => Object.fromEntries(KEYS.map((k, i) => [k, p[i]]));

test.describe('aggregate', () => {
  test('one image == single-image path for all 10 samples (regression)', () => {
    for (const [f, e] of Object.entries(expected)) {
      const agg = aggregate([{ ok: true, logits: logitsFor(e.probs, card.temperature) }], card.temperature, card.tau, card.margin, NC, NEVER);
      const single = decide(e.probs, card.tau, card.margin, NC, NEVER);
      expect(agg.decision.kind, f).toBe(single.kind);
      expect(agg.decision.kind === 'abstain' ? 'abstain' : agg.decision.kind, f).toBe(e.decision);
      for (let i = 0; i < KEYS.length; i++) expect(agg.probs![i]).toBeCloseTo(e.probs[i], 6);
    }
  });

  test('mean of temperature-scaled logits, not a product of probabilities', () => {
    const T = 2;
    const a = [4, 0, 0, 0, 0, 0, 0];
    const b = [0, 4, 0, 0, 0, 0, 0];
    const agg = aggregate([{ ok: true, logits: a }, { ok: true, logits: b }], T, 0.5, 0.15, NC);
    const want = softmax([2, 2, 0, 0, 0, 0, 0], 2); // mean logits [2,2,0..] / T
    for (let i = 0; i < 7; i++) expect(agg.probs![i]).toBeCloseTo(want[i], 9);
  });

  test('2–3 images: abstain unless >= 2 per-image top-1 agree', () => {
    const strong = (c: number) => Array.from({ length: 7 }, (_, i) => (i === c ? 8 : 0));
    const agree = aggregate([{ ok: true, logits: strong(1) }, { ok: true, logits: strong(1) }, { ok: true, logits: strong(0) }], 1, 0.5, 0.15, NC);
    expect(agree.agree).toBe(2);
    expect(agree.decision.kind).toBe('predict');
    // all three different, mean still has a clear winner -> forced abstain
    const x = [8, 0, 0, 0, 0, 0, 0];
    const y = [7.9, 9, 0, 0, 0, 0, 0];
    const z = [7.9, 0, 9, 0, 0, 0, 0];
    const dis = aggregate([{ ok: true, logits: x }, { ok: true, logits: y }, { ok: true, logits: z }], 1, 0.3, 0.05, NC);
    expect(dis.disagree).toBe(true);
    expect(dis.decision.kind).toBe('abstain');
  });

  test('images failing the quality gate are skipped and counted', () => {
    const l = [8, 0, 0, 0, 0, 0, 0];
    const r = aggregate([{ ok: true, logits: l }, { ok: false }, { ok: false }], 1, 0.5, 0.15, NC);
    expect(r.used).toBe(1);
    expect(r.skipped).toBe(2);
    expect(r.decision.kind).toBe('predict');
    expect(aggregate([{ ok: false }], 1, 0.5, 0.15, NC).decision.kind).toBe('retake');
  });

  test('never_assert still applies after aggregation; reasons', () => {
    const mite = [0, 0, 9, 0, 0, 0, 0];
    const r = aggregate([{ ok: true, logits: mite }, { ok: true, logits: mite }], 1, 0.5, 0.15, NC, [ID.red_spider_mite]);
    expect(r.decision.kind).toBe('abstain');
    expect(reasonOf(r.decision, 0.5, 0.15)).toBe('ambiguous');
    const low = aggregate([{ ok: true, logits: [0.1, 0, 0, 0, 0, 0, 0] }], 1, 0.8, 0.15, NC);
    expect(reasonOf(low.decision, 0.8, 0.15)).toBe('unknown');
  });
});

test.describe('differential', () => {
  const probs = keyed([0.3, 0.05, 0.6, 0.01, 0.01, 0.01, 0.02]); // mite > healthy
  const prior = coffeePrior(probs);

  test('prior renormalised over 6 coffee classes; candidates exclude not_coffee', () => {
    const s = Object.values(prior).reduce((a, b) => a + b, 0);
    expect(s).toBeCloseTo(1, 9);
    expect(candidates(prior)).toEqual(['red_spider_mite', 'healthy']);
  });

  test('question selection: top-1 first, healthy -> q_any_sign, nutrition last, max 3', () => {
    const q = selectQuestions(['red_spider_mite', 'healthy'], QS).map((x) => x.id);
    expect(q).toEqual(['q_mite_seen', 'q_any_sign', 'q_uniform_yellow']);
    expect(selectQuestions(['rust', 'cercospora'], QS).map((x) => x.id)).toEqual(['q_rust_powder', 'q_eye_spot', 'q_uniform_yellow']);
  });

  test('likelihood-ratio update, "không rõ" = 1', () => {
    const p = update(prior, { q_mite_seen: 'yes' }, QS);
    const raw = { ...prior, red_spider_mite: prior.red_spider_mite * 5 };
    const s = Object.values(raw).reduce((a, b) => a + b, 0);
    expect(p.red_spider_mite).toBeCloseTo(raw.red_spider_mite / s, 9);
    const u = update(prior, { q_mite_seen: 'unsure', q_any_sign: 'unsure' }, QS);
    for (const k of Object.keys(prior)) expect(u[k as keyof typeof u]).toBeCloseTo(prior[k as keyof typeof prior], 9);
  });

  test('mite can be assisted only with q_mite_seen = yes', () => {
    const a1: Record<string, Answer> = { q_mite_seen: 'yes', q_any_sign: 'yes' };
    const o1 = outcome(prior, a1, QS);
    expect(o1.kind).toBe('assisted');
    expect(o1.kind === 'assisted' && o1.key).toBe('red_spider_mite');
    // strong posterior from other evidence but mites not seen -> never assisted mite
    const strongMite = coffeePrior(keyed([0.001, 0.001, 0.99, 0.002, 0.002, 0.002, 0.002]));
    const o2 = outcome(strongMite, { q_bronze_dry: 'yes', q_any_sign: 'yes' }, QS);
    expect(o2.kind).toBe('uncertain');
    const o3 = outcome(strongMite, { q_mite_seen: 'unsure', q_bronze_dry: 'yes' }, QS);
    expect(o3.kind).toBe('uncertain');
  });

  test('assisted needs posterior >= 0.85 and a supporting answer', () => {
    const rustPrior = coffeePrior(keyed([0.4, 0.5, 0.02, 0.02, 0.02, 0.02, 0.02]));
    expect(outcome(rustPrior, {}, QS).kind).toBe('uncertain'); // no answers
    const o = outcome(rustPrior, { q_rust_powder: 'yes', q_any_sign: 'yes' }, QS);
    expect(o.kind).toBe('assisted');
    expect(o.kind === 'assisted' && o.key).toBe('rust');
    expect(outcome(rustPrior, { q_rust_powder: 'unsure' }, QS).kind).toBe('uncertain');
  });

  test('nutrition flag: uniform yellowing and no disease sign', () => {
    const rustPrior = coffeePrior(keyed([0.4, 0.5, 0.02, 0.02, 0.02, 0.02, 0.02]));
    expect(outcome(rustPrior, { q_uniform_yellow: 'yes', q_rust_powder: 'no' }, QS).kind).toBe('nutrition');
    expect(outcome(rustPrior, { q_uniform_yellow: 'yes', q_rust_powder: 'yes' }, QS).kind).not.toBe('nutrition');
  });
});
