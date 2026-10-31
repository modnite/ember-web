import { test } from '@playwright/test';
test('prod login on a phone', async ({ page }) => {
  const seen: string[] = [];
  page.on('response', (r) => { if (/emoji|\.png/.test(r.url())) seen.push(`${r.status()} ${r.url().slice(0, 90)} sw=${r.fromServiceWorker()}`); });
  page.on('requestfailed', (r) => seen.push(`FAIL ${r.url().slice(0, 90)} ${r.failure()?.errorText}`));
  await page.goto('https://call.cdsrv.com/', { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  console.log('NET', JSON.stringify(seen));
  console.log('LOGO', await page.locator('.xp-logon-logo').evaluateAll((els) => els.map((e) => e.innerHTML.slice(0, 250))));
  await page.screenshot({ path: 'test-results/prod-phone-login.png' });
});
