import { test, expect } from '@playwright/test';

// Production smoke test: run with PROD_URL=https://ami-ama.vercel.app npx playwright test tests/prod.spec.ts
const URL = process.env.PROD_URL;
test.skip(!URL, 'set PROD_URL to run against a deployment');
// The cloud test container re-terminates TLS through an egress proxy whose CA Chromium does not trust.
test.use({ ignoreHTTPSErrors: !!process.env.PROD_IGNORE_TLS, launchOptions: { executablePath: '/opt/pw-browsers/chromium', args: process.env.PROD_IGNORE_TLS ? ['--ignore-certificate-errors'] : [] } });

test('production: offline-ready ✓, then works in airplane mode', async ({ page, context }) => {
  await page.goto(URL!);
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  const t0 = Date.now();
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 120_000 });
  console.log('READY_AFTER_MS', Date.now() - t0);
  await page.screenshot({ path: 'docs/screenshots/prod-ready.png' });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('offline-ready')).toBeVisible();
  await page.goto(URL! + '/#/samples');
  await page.getByTestId('sample-2').click();
  await expect(page.getByTestId('result')).toHaveAttribute('data-kind', 'predict', { timeout: 60_000 });
  console.log('RESULT', await page.getByTestId('result-title').textContent());
  // bean leaf -> not coffee
  await page.goto(URL! + '/#/samples');
  await page.getByTestId('sample-9').click();
  await expect(page.getByTestId('result')).toHaveAttribute('data-kind', 'not_coffee', { timeout: 60_000 });
  // red spider mite (gated) -> "Có thể là Nhện đỏ" -> questions panel (v1.1)
  await page.goto(URL! + '/#/samples');
  await page.getByTestId('sample-4').click();
  await expect(page.getByTestId('maybe')).toHaveText(/Có thể là\s+Nhện đỏ$/, { timeout: 60_000 });
  if (process.env.PROD_V11) {
    await page.getByTestId('dif-now').click();
    await expect(page.getByTestId('differential')).toBeVisible();
    console.log('V11 differential visible');
  }
});
