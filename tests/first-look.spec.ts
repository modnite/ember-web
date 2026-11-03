import { expect, test } from '@playwright/test';

test('new install previews and retains choices, then skips welcome on reload', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make Ember yours' })).toBeVisible();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  const accent = page.locator('.swatch').nth(3);
  await accent.click();
  await expect(accent).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `test-results/${info.project.name}-first-look.png`, fullPage: true });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('#u')).toBeVisible();
  await page.reload();
  await expect(page.locator('#u')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ember.prefs')!).theme)).toBe('dark');
});

test('Skip restores defaults after preview changes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Black', exact: true }).click();
  await page.locator('.swatch').nth(2).click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.locator('#u')).toBeVisible();
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('ember.prefs')!));
  expect(prefs.theme).toBe('system');
  expect(prefs.accent).toBe('');
});

test('existing appearance is retained without welcome', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ember.prefs', JSON.stringify({theme: 'black', accent: '#008080'})));
  await page.goto('/');
  await expect(page.locator('#u')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Make Ember yours' })).toHaveCount(0);
});
