import { expect, test, type Page } from '@playwright/test';

const user = process.env.EMBER_USER ?? 'me';
const pass = process.env.EMBER_PASS ?? 'password123';

async function signIn(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('ember.appearanceSetup', 'done'));
  await page.goto('/');
  await page.locator('#u').fill(user);
  await page.locator('#p').fill(pass);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: /New chat/ })).toBeVisible();
}

test('signs in and shows the chat list', async ({ page }, info) => {
  await signIn(page);
  await expect(page.getByRole('button', { name: /Weekend plans/ })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-list.png` });
});

test('opens a group chat and sends a message', async ({ page }, info) => {
  await signIn(page);
  await page.getByRole('button', { name: /Weekend plans/ }).click();
  const box = page.getByLabel('Message', { exact: true });
  await expect(box).toBeVisible();
  const text = `hello from ${info.project.name} ${Date.now()}`;
  await box.fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.bubble .text', { hasText: text })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-chat.png` });
});
