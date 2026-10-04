import { test, expect, type Page } from '@playwright/test';

// v1.1 "uncertain is useful" flow — runs fully offline after first load.
const BASE = process.env.V11_URL ?? '';

async function setup(page: Page, context: import('@playwright/test').BrowserContext) {
  await page.goto(BASE + '/');
  await page.getByTestId('consent-photos').check();
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 120_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('offline-ready')).toBeVisible();
}

async function sample(page: Page, i: number) {
  await page.goto(BASE + '/#/samples');
  await page.getByTestId(`sample-${i}`).click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 60_000 });
}

async function answer(page: Page, qid: string, a: 'yes' | 'no' | 'unsure') {
  await page.locator(`[data-qid="${qid}"] [data-answer="${a}"]`).click();
}

/** Answer every question shown: `fixed` for named ids, `rest` for the others. Returns the ids shown. */
async function answerAll(page: Page, fixed: Record<string, 'yes' | 'no' | 'unsure'>, rest: 'yes' | 'no' | 'unsure') {
  const ids = await page.locator('[data-qid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-qid')!));
  for (const id of ids) await answer(page, id, fixed[id] ?? rest);
  return ids;
}

test('plant check: abstain -> add 2 leaves -> "Kết quả từ 3 lá"', async ({ page, context }) => {
  await setup(page, context);
  await sample(page, 3); // 03_rust: single-image abstain
  const r = page.getByTestId('result');
  await expect(r).toHaveAttribute('data-kind', 'abstain');
  await expect(page.getByTestId('result-title')).toHaveText('Chưa chắc — cùng kiểm tra thêm');
  await expect(page.getByTestId('add-leaves')).toHaveText(/Chụp thêm 2 lá trên cùng cây/);
  await expect(page.getByTestId('fill-warn')).toHaveCount(0);
  for (const i of [2, 1]) {
    await page.getByTestId('add-leaves').click();
    await expect(page.getByTestId('capture-title')).toHaveText(/Lá thứ \d trên cùng cây/);
    await page.getByTestId('add-from-samples').click();
    await page.getByTestId(`sample-${i}`).click();
    await expect(page.getByTestId('result')).toBeVisible();
    if (i === 2) await expect(page.getByTestId('leaves-count')).toHaveText(/Kết quả từ 2 lá/);
  }
  await expect(page.getByTestId('leaves-count')).toHaveText(/Kết quả từ 3 lá/);
  await expect(r).toHaveAttribute('data-leaves', '3');
  console.log('AGG', await r.getAttribute('data-kind'), await r.getAttribute('data-card'), await r.getAttribute('data-reason'));
  await page.screenshot({ path: 'docs/screenshots/v11-three-leaves.png', fullPage: true });
});

test('tell-apart: assisted only with supporting answers; mite needs q_mite_seen; nutrition path', async ({ page, context }) => {
  await setup(page, context);
  // gated red spider mite sample -> questions
  await sample(page, 4);
  await expect(page.getByTestId('result')).toHaveAttribute('data-kind', 'abstain');
  await expect(page.getByTestId('maybe')).toHaveText(/Có thể là\s+Nhện đỏ$/);
  await page.getByTestId('dif-now').click();
  const dif = page.getByTestId('differential');
  await expect(dif).toBeVisible();
  await expect(dif.locator('.dif-cand img')).toHaveCount(2);
  await expect(dif).toContainText('Nhện đỏ');
  console.log('CANDS', await dif.getAttribute('data-cands'));
  // (a) mites NOT seen, other signs "không rõ" -> never an assisted mite result
  const ids = await answerAll(page, { q_mite_seen: 'no' }, 'unsure');
  console.log('QIDS', ids.join(','));
  expect(ids[0]).toBe('q_mite_seen');
  expect(ids.at(-1)).toBe('q_uniform_yellow');
  await page.getByTestId('dif-show').click();
  await expect(page.getByTestId('assisted-badge')).toHaveCount(0);
  await expect(page.getByTestId('waiting')).toBeVisible();
  await expect(page.getByTestId('send-case')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/v11-waiting.png', fullPage: true });

  // (b) mites seen -> assisted, labelled as the farmer's observation
  await sample(page, 4);
  await page.getByTestId('dif-now').click();
  await answerAll(page, { q_mite_seen: 'yes', q_uniform_yellow: 'no' }, 'unsure');
  await page.getByTestId('dif-show').click();
  await expect(page.getByTestId('assisted-badge')).toHaveText('Theo dấu hiệu bạn thấy — chưa phải AI khẳng định');
  await expect(page.getByTestId('result')).toHaveAttribute('data-card', 'red_spider_mite');
  await page.screenshot({ path: 'docs/screenshots/v11-assisted.png', fullPage: true });

  // (c) unsure about mites -> still not assisted
  await sample(page, 4);
  await page.getByTestId('dif-now').click();
  await answerAll(page, { q_mite_seen: 'unsure', q_bronze_dry: 'yes', q_uniform_yellow: 'no' }, 'unsure');
  await page.getByTestId('dif-show').click();
  await expect(page.getByTestId('assisted-badge')).toHaveCount(0);

  // (d) nutrition: uniform yellowing, no disease sign
  await sample(page, 4);
  await page.getByTestId('dif-now').click();
  await answerAll(page, { q_uniform_yellow: 'yes' }, 'no');
  await page.getByTestId('dif-show').click();
  await expect(page.getByTestId('result')).toHaveAttribute('data-card', 'not_disease_nutrition');
  await expect(page.getByTestId('result-title')).toHaveText('Có thể không phải bệnh — có thể do dinh dưỡng, đất hoặc nước');
});

test('follow-up reminder, case image, share fallback, unsent filter, expert answer', async ({ page, context }) => {
  // no Web Share in this browser -> exercise the download + copy fallback
  await page.addInitScript(() => {
    // @ts-expect-error test-only removal
    delete Navigator.prototype.share;
    // @ts-expect-error test-only removal
    delete Navigator.prototype.canShare;
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.install({ time: new Date('2026-10-04T08:00:00Z') });
  await setup(page, context);
  await sample(page, 4);
  await page.getByTestId('dif-now').click();
  await answer(page, 'q_mite_seen', 'no');
  await page.getByTestId('dif-show').click();
  await page.getByTestId('remind').click();
  await expect(page.getByTestId('reminded')).toBeVisible();
  // Hỏi người -> case packet image
  await page.getByTestId('send-case').click();
  const img = page.getByTestId('case-img');
  await expect(img).toBeVisible();
  const bytes = Number(await img.getAttribute('data-bytes'));
  console.log('CASE_BYTES', bytes);
  expect(bytes).toBeGreaterThan(5_000);
  expect(bytes).toBeLessThan(400 * 1024);
  await expect(page.getByTestId('ask-msg')).toHaveValue(/lá có dấu hiệu chưa rõ \(Chưa chắc\)/);
  await page.screenshot({ path: 'docs/screenshots/v11-case.png', fullPage: true });
  const dl = page.waitForEvent('download');
  await page.getByTestId('send-zalo').click();
  expect((await dl).suggestedFilename()).toMatch(/^phieu-hoi-.*\.jpg$/);
  await expect(page.getByTestId('toast')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('[Ami Ama]');
  await expect(page.getByTestId('call-link')).toHaveAttribute('href', /^tel:/);

  // an unsent entry + expert answer
  await sample(page, 2);
  await page.getByTestId('save').click();
  await page.goto(BASE + '/#/log');
  await page.getByTestId('filter-unsent').click();
  await expect(page.getByTestId('log-entry')).toHaveCount(1);
  await expect(page.getByTestId('log-send')).toBeVisible();
  await page.getByTestId('expert-open').first().click();
  await page.getByTestId('expert-label').selectOption('rust');
  await page.getByTestId('expert-save').click();
  await expect(page.getByTestId('expert-saved')).toContainText('Bệnh rỉ sắt');

  // 5 days later (mocked clock) -> home banner -> follow-up capture of the same tree
  await page.clock.fastForward(5 * 86400000);
  await page.goto(BASE + '/#/home');
  await page.reload();
  await expect(page.getByTestId('follow-banner')).toHaveText(/Có 1 cây cần xem lại/);
  await page.getByTestId('follow-banner').click();
  await expect(page.getByTestId('capture-title')).toHaveText('Xem lại cây đã hẹn');
});
