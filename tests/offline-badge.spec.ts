import { test, expect } from '@playwright/test';

// A precache item that fails must produce a clear retry state, never an endless "Đang tải… N%".
test('offline badge: failed asset -> retry state -> retry succeeds -> ready', async ({ page, context }) => {
  let block = true;
  await context.route('**/models/leaf_v1.int8.onnx*', (route) =>
    block ? route.fulfill({ status: 404, body: 'not found' }) : route.continue(),
  );
  await page.goto('/');
  const err = page.getByTestId('offline-error');
  await expect(err).toBeVisible({ timeout: 70_000 });
  await expect(err).toContainText('Thử lại');
  await page.screenshot({ path: 'docs/screenshots/offline-retry-state.png' });
  block = false;
  await err.click();
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 60_000 });
  // the retried file is served offline by the runtime cache
  await context.setOffline(true);
  const status = await page.evaluate(async () => (await fetch('/models/leaf_v1.int8.onnx')).status);
  expect(status).toBe(200);
});
