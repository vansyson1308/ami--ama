import { test, expect } from '@playwright/test';

test('M1: app shell becomes offline-ready and reloads in airplane mode', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 120_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Ami Ama').first()).toBeVisible();
  await expect(page.getByTestId('offline-ready')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/m1-offline.png' });
  // manifest is served and parsable (installability prerequisite)
  await context.setOffline(false);
  const m = await (await page.request.get('/manifest.webmanifest')).json();
  expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBeTruthy();
  expect(m.display).toBe('standalone');
  // Chrome's own installability check (what Lighthouse's PWA audit used): expect zero errors.
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  console.log('installabilityErrors', JSON.stringify(installabilityErrors));
  // 'in-incognito' is inherent to Playwright's ephemeral contexts, not to the app.
  expect(installabilityErrors.filter((e: { errorId: string }) => e.errorId !== 'in-incognito')).toEqual([]);
  const man = await cdp.send('Page.getAppManifest');
  expect(man.errors).toEqual([]);
});
