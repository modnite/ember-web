import { expect, test, type Page } from '@playwright/test';

async function openChat(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#u').fill(process.env.EMBER_USER ?? 'me');
  await page.locator('#p').fill(process.env.EMBER_PASS ?? 'password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Weekend plans/ }).click();
  await expect(page.getByRole('log')).toBeVisible();
}

const panel = (page: Page) => page.getByRole('region', { name: 'Emoji, GIFs and stickers' });
const toggle = (page: Page) => page.getByRole('button', { name: /Emoji, GIFs and stickers|Keyboard/ }).first();

test('emoji pictures in messages, the emoji grid and jumbo emoji', async ({ page }, info) => {
  await openChat(page);
  await toggle(page).click();
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('searchbox', { name: 'Search emoji' }).fill('heart');
  await panel(page).locator('.emoji-grid button').first().click();
  const box = page.getByRole('textbox', { name: 'Message' });
  await expect(box).toHaveValue(/.+/);
  await page.screenshot({ path: `test-results/${info.project.name}-panel-emoji.png` });
  await box.fill('');
  // Typing again closes the panel, like the messengers.
  await expect(panel(page)).toBeHidden();
  await box.fill('see you 😀😀 soon');
  await page.getByRole('button', { name: 'Send' }).click();
  const bubble = page.locator('.bubble .text', { hasText: 'see you' }).last();
  await expect(bubble.locator('img.emoji')).toHaveCount(2);
  await expect.poll(() => bubble.locator('img.emoji').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await box.fill('🎉');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.bubble .text.jumbo img.emoji').last()).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-emoji-messages.png` });
});

test('stickers and GIFs: add, keep, send, and show without a bubble', async ({ page }, info) => {
  await openChat(page);
  await toggle(page).click();
  await panel(page).getByRole('tab', { name: 'Stickers' }).click();
  await panel(page).locator('input[type=file]').setInputFiles('tests/fixtures/face.png');
  const tile = panel(page).getByRole('button', { name: 'Send this sticker' });
  await expect(tile).toHaveCount(1);
  await page.screenshot({ path: `test-results/${info.project.name}-panel-stickers.png` });
  await tile.click();
  await expect(page.locator('.bubble.sticker').last()).toBeVisible();

  await toggle(page).click();
  await panel(page).getByRole('tab', { name: 'GIFs' }).click();
  await panel(page).locator('input[type=file]').setInputFiles('tests/fixtures/spin.gif');
  await expect(panel(page).getByRole('button', { name: 'Send this GIF' })).toHaveCount(1);
  await page.screenshot({ path: `test-results/${info.project.name}-panel-gifs.png` });
  await panel(page).getByRole('button', { name: 'Send this GIF' }).click();
  await expect(page.locator('img[alt^="gif-"]').last()).toBeVisible();

  // The sticker can be saved again from the chat.
  await page.locator('.bubble.sticker').last().click({ button: 'right' });
  await expect(page.getByRole('button', { name: 'Save to favourites' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test-results/${info.project.name}-sticker-menu.png` });
});

test('GIF sources: Wikimedia and reactions answer, Giphy asks for a key', async ({ page }, info) => {
  await openChat(page);
  await toggle(page).click();
  await panel(page).getByRole('tab', { name: 'GIFs' }).click();
  await panel(page).getByRole('tab', { name: 'Giphy' }).click();
  await expect(panel(page).getByText(/needs a key of your own/)).toBeVisible();
  await panel(page).getByRole('tab', { name: 'Wikimedia' }).click();
  await expect(panel(page).locator('.mp-tile img').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => panel(page).locator('.mp-tile img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
  await page.screenshot({ path: `test-results/${info.project.name}-panel-online.png` });
  await panel(page).getByRole('tab', { name: 'Stickers' }).click().catch(() => undefined);
});

test('more reactions from the emoji grid, and the GIF keys in Settings', async ({ page }, info) => {
  await openChat(page);
  const last = page.locator('.bubble').last();
  await last.click({ button: 'right' });
  await page.getByRole('button', { name: 'More reactions' }).click();
  await page.getByRole('searchbox', { name: 'Search emoji' }).fill('fire');
  await page.locator('.emoji-grid button').first().click();
  await expect(page.locator('.reactions .reaction img.emoji').last()).toBeVisible();
  await page.goto('/#/settings');
  const giphy = page.getByLabel('Giphy key');
  await giphy.scrollIntoViewIfNeeded();
  await giphy.fill('abc123');
  await page.reload();
  await expect(page.getByLabel('Giphy key')).toHaveValue('abc123');
  await page.getByLabel('Giphy key').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/${info.project.name}-settings-keys.png` });
  await page.getByLabel('Giphy key').fill('');
});
