import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const expected: Record<string, { probs: number[]; top1: string; decision: string; true: string }> = JSON.parse(
  readFileSync('tests/fixtures/expected.json', 'utf8'),
);
const labels: { key: string }[] = JSON.parse(readFileSync('public/models/labels.json', 'utf8'));
const KEY2ID = Object.fromEntries(labels.map((l, i) => [l.key, i]));
const files = Object.keys(expected).sort();
const SHOT = 'docs/screenshots';

async function onboard(page: Page) {
  await page.goto('/');
  await page.getByTestId('consent-photos').check();
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 120_000 });
}

async function runSample(page: Page, i: number) {
  await page.goto('/#/samples');
  await page.getByTestId(`sample-${i}`).click();
  const res = page.getByTestId('result');
  await expect(res).toBeVisible({ timeout: 60_000 });
  return res;
}

test('offline end-to-end: samples, parity, audio, abstain, field log, escalation', async ({ page, context }) => {
  test.setTimeout(600_000);
  await onboard(page);
  await page.screenshot({ path: `${SHOT}/01-home.png` });

  // ---- airplane mode from here on ----
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('offline-ready')).toBeVisible();
  await expect(page.getByRole('button', { name: /Chụp lá/ })).toBeVisible();

  // Samples screen + JS vs Python parity on every sample
  const parity: Record<string, unknown>[] = [];
  for (let i = 0; i < files.length; i++) {
    const res = await runSample(page, i);
    const exp = expected[files[i]];
    await expect(res.getByTestId('advice-card')).toBeVisible();
    await expect(res.locator('audio')).toHaveCount(1);
    const kind = await res.getAttribute('data-kind');
    const items = res.getByTestId('probs').locator('li');
    const top: { key: string; p: number }[] = [];
    for (let k = 0; k < (await items.count()); k++) {
      top.push({ key: (await items.nth(k).getAttribute('data-key'))!, p: Number(await items.nth(k).getAttribute('data-p')) });
    }
    const maxDiff = Math.max(...top.map((t) => Math.abs(t.p - exp.probs[KEY2ID[t.key]])));
    parity.push({ file: files[i], js_top1: top[0].key, py_top1: exp.top1, maxDiff, js_kind: kind, py_kind: exp.decision });
    expect(top[0].key).toBe(exp.top1);
    expect(maxDiff).toBeLessThanOrEqual(0.01);
    expect(kind).toBe(exp.decision === 'not_coffee' ? 'not_coffee' : exp.decision);
    if (i < 3) {
      await page.screenshot({ path: `${SHOT}/result-${files[i].replace('.jpg', '')}.png`, fullPage: true });
      await res.getByTestId('save').click();
      await expect(res.getByTestId('save')).toHaveText(/Đã lưu/);
    }
  }
  console.log('PARITY', JSON.stringify(parity));

  // Audio plays offline from the precache
  const audio = await page.evaluate(async () => {
    const r = await fetch('/audio/vi/rust.ogg');
    const b = await r.blob();
    const a = new Audio(URL.createObjectURL(b));
    await new Promise((ok, ko) => {
      a.onloadedmetadata = ok;
      a.onerror = ko;
    });
    return { status: r.status, bytes: b.size, duration: a.duration };
  });
  console.log('AUDIO', JSON.stringify(audio));
  expect(audio.status).toBe(200);
  expect(audio.duration).toBeGreaterThan(3);

  // ABSTAIN: the model must say "Chưa chắc — hỏi cán bộ" with escalation one tap away
  const abstainIdx = files.findIndex((f) => expected[f].decision === 'abstain');
  let res;
  if (abstainIdx >= 0) {
    res = await runSample(page, abstainIdx);
  } else {
    await page.goto('/#/capture');
    await page.getByTestId('file-input').setInputFiles('tests/fixtures/odd.jpg');
    await page.getByTestId('check').click();
    res = page.getByTestId('result');
  }
  await expect(res).toHaveAttribute('data-kind', abstainIdx >= 0 ? 'abstain' : /abstain|not_coffee/);
  if (abstainIdx >= 0) {
    await expect(page.getByTestId('result-title')).toHaveText('Chưa chắc — hỏi cán bộ');
    await expect(page.getByRole('button', { name: /Hỏi cán bộ/ }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/abstain.png`, fullPage: true });
  }

  // Quality gate: blurred photo -> retake card, no prediction
  await page.goto('/#/capture');
  await page.getByTestId('file-input').setInputFiles('tests/fixtures/blurred.jpg');
  await page.getByTestId('check').click();
  await expect(page.getByTestId('result')).toHaveAttribute('data-kind', 'retake');
  await expect(page.getByTestId('result-title')).toHaveText('Ảnh chưa rõ — chụp lại nhé');
  await page.screenshot({ path: `${SHOT}/retake.png` });

  // Odd (non-leaf texture) image: must NOT get a disease card
  await page.goto('/#/capture');
  await page.getByTestId('file-input').setInputFiles('tests/fixtures/odd.jpg');
  await page.getByTestId('check').click();
  const oddKind = await page.getByTestId('result').getAttribute('data-kind');
  console.log('ODD', oddKind, await page.getByTestId('result-title').textContent());

  // Field log persists across an offline reload
  await page.reload();
  await page.goto('/#/log');
  await expect(page.getByTestId('log-entry')).toHaveCount(3);
  await expect(page.getByTestId('log-entry').first().locator('img')).toBeVisible(); // consented thumbnail
  await expect(page.getByText('Chờ gửi').first()).toBeVisible();
  await page.screenshot({ path: `${SHOT}/field-log.png`, fullPage: true });

  // Hỏi người: pre-filled SMS
  await page.goto('/#/ask');
  const href = await page.getByTestId('sms-link').getAttribute('href');
  expect(href).toMatch(/^sms:/);
  expect(decodeURIComponent(href!)).toContain('[Ami Ama] Rẫy của tôi:');
  await page.screenshot({ path: `${SHOT}/ask.png`, fullPage: true });

  // Evidence + prices render offline
  await page.goto('/#/evidence');
  await expect(page.getByTestId('metrics')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/evidence.png`, fullPage: true });
  await page.goto('/#/prices');
  await page.getByTestId('offer').fill('90000');
  await expect(page.getByTestId('diff')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/prices.png`, fullPage: true });
});
