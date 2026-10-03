import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, renameSync } from 'node:fs';

// Demo media for video/LinkedIn. Run: MEDIA=1 npx playwright test tests/media.spec.ts  (then scripts/media.sh)
test.skip(!process.env.MEDIA, 'set MEDIA=1 to record demo media');
const OUT = 'docs/media';
const VIEW = { width: 390, height: 844 };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function caption(page: Page, text: string | null) {
  // A caption for the video only (not part of the app UI).
  await page.evaluate((t) => {
    document.getElementById('demo-caption')?.remove();
    if (!t) return;
    const d = document.createElement('div');
    d.id = 'demo-caption';
    d.textContent = t;
    Object.assign(d.style, {
      position: 'fixed', left: '12px', right: '12px', bottom: '18px', zIndex: '99', padding: '10px 14px',
      background: 'rgba(0,0,0,.78)', color: '#fff', font: '600 17px system-ui, sans-serif', borderRadius: '12px', textAlign: 'center',
    });
    document.body.appendChild(d);
  }, text);
}

test('record demo video', async ({ browser }) => {
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({
    viewport: VIEW, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale: 'vi-VN',
    recordVideo: { dir: `${OUT}/raw`, size: VIEW },
  });
  const page = await ctx.newPage();
  await page.goto('/');
  await pause(1300);
  await page.getByTestId('consent-photos').check();
  await pause(500);
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 60_000 });
  await pause(1300);
  await page.getByRole('button', { name: /Thử với ảnh mẫu/ }).click();
  await pause(1000);
  await page.getByTestId('sample-2').click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  await pause(1600);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 120);
    await pause(160);
  }
  await pause(500);
  await page.getByTestId('save').scrollIntoViewIfNeeded();
  await pause(400);
  await page.getByTestId('save').click();
  await pause(900);
  await ctx.setOffline(true);
  await page.goto('/#/log');
  await page.reload();
  await caption(page, '✈️ Không có mạng — vẫn chạy');
  await expect(page.getByTestId('offline-ready')).toBeVisible();
  await expect(page.getByTestId('log-entry').first()).toBeVisible();
  await pause(2200);
  const video = page.video();
  await ctx.close();
  renameSync((await video!.path())!, `${OUT}/raw/demo.webm`);
});

test('clean screenshots', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: VIEW, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const shot = (n: string) => page.screenshot({ path: `${OUT}/raw/${n}.png` });
  await page.goto('/');
  await page.getByTestId('consent-photos').check();
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 60_000 });
  await ctx.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('offline-ready')).toBeVisible();
  await shot('01-home-offline');
  await page.goto('/#/samples');
  await expect(page.getByTestId('sample-9')).toBeVisible();
  await pause(400);
  await shot('02-samples');
  await page.getByTestId('sample-2').click();
  await expect(page.getByTestId('result')).toHaveAttribute('data-kind', 'predict');
  await page.getByTestId('save').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('03-result-rust');
  await page.goto('/#/samples');
  await page.getByTestId('sample-4').click();
  await expect(page.getByTestId('result')).toHaveAttribute('data-kind', 'abstain');
  await page.getByTestId('save').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('04-uncertain-ask-officer');
  await page.goto('/#/log');
  await expect(page.getByTestId('log-entry')).toHaveCount(2);
  await shot('05-field-log');
  await page.goto('/#/evidence');
  await expect(page.getByTestId('metrics')).toBeVisible();
  await shot('06-evidence');
  await ctx.close();
});
