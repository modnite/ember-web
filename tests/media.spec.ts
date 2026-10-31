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

test('appearance: black theme, accent colour and wallpaper apply and stay', async ({ page }, info) => {
  await openChat(page);
  await page.goto('/#/settings');
  const root = page.locator('html');
  await page.getByRole('button', { name: /^Theme/ }).click();
  await page.getByRole('radio', { name: /^Black/ }).click();
  await expect(root).toHaveAttribute('data-black', '1');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())).toBe('#000000');
  await page.getByRole('button', { name: /^Accent colour/ }).click();
  await page.getByRole('radio', { name: 'Blue' }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())).not.toBe('');
  await expect(page.getByRole('button', { name: /^Accent colour/ })).toContainText('Blue');
  await page.getByRole('button', { name: /^Chat wallpaper/ }).click();
  await page.getByRole('radio', { name: 'Gradient' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.screenshot({ path: `test-results/${info.project.name}-appearance.png` });
  await page.reload();
  await expect(root).toHaveAttribute('data-black', '1');
  await expect(page.getByRole('button', { name: /^Accent colour/ })).toContainText('Blue');
  await page.getByRole('button', { name: /^Chats$/ }).click();
  await page.getByRole('button', { name: /Weekend plans/ }).click();
  await expect.poll(() => page.locator('.messages').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
  await page.screenshot({ path: `test-results/${info.project.name}-black-chat.png` });
  // back to the defaults for the next test
  await page.evaluate(() => localStorage.removeItem('ember.prefs'));
});

test('photos go out as Standard (1600) or HD (up to 4096)', async ({ page }) => {
  await openChat(page);
  const widthOfLast = async (): Promise<number> => {
    const img = page.locator('.bubble img[src*="/api/attachments/"]').last();
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    return img.evaluate((i: HTMLImageElement) => i.naturalWidth);
  };
  const send = async (): Promise<void> => {
    await page.locator('input[type=file][accept="image/*,video/*"]').first().setInputFiles('tests/fixtures/big.jpg');
    await page.getByRole('button', { name: 'Send' }).click();
  };
  await send();
  await expect.poll(widthOfLast, { timeout: 30_000 }).toBe(1600);
  await page.goto('/#/settings');
  await page.getByText('Send photos in HD').click();
  await page.getByRole('button', { name: /^Chats$/ }).click();
  await page.getByRole('button', { name: /Weekend plans/ }).click();
  await send();
  await expect.poll(widthOfLast, { timeout: 30_000 }).toBe(3000);
  await page.evaluate(() => localStorage.removeItem('ember.prefs'));
});

test('nudge: the button sends one, and a nudge from someone else shakes the chat and says so', async ({ page, request }) => {
  await openChat(page);
  // On a narrow screen the button lives in the attach menu so the title keeps its room.
  if (!(await page.getByRole('button', { name: 'Nudge' }).first().isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Attach' }).click();
    await page.getByRole('button', { name: 'Nudge' }).click();
  } else {
    await page.getByRole('button', { name: 'Nudge' }).click();
  }
  await expect(page.getByText('You sent a nudge')).toBeVisible();
  // someone else nudges the same group (a second account on the scratch server)
  const other = await request.post('/api/auth/login', { data: { username: process.env.EMBER_OTHER ?? 'maya', password: process.env.EMBER_PASS ?? 'password123' } });
  test.skip(!other.ok(), 'no second account on this server');
  const rooms = (await (await request.get('/api/rooms')).json()) as { rooms: Array<{ id: string; name: string }> };
  const room = rooms.rooms.find((r) => r.name === 'Weekend plans')!;
  const res = await request.post(`/api/rooms/${room.id}/nudge`);
  expect(res.ok()).toBe(true);
  await expect(page.getByText(/sent a nudge/).last()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.chat')).toHaveClass(/shake/);
});

test('search: message text is found and opens at the message', async ({ page }) => {
  await page.goto('/');
  await page.locator('#u').fill(process.env.EMBER_USER ?? 'me');
  await page.locator('#p').fill(process.env.EMBER_PASS ?? 'password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: /New chat/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search chats' }).fill('bakery');
  const hit = page.getByRole('region', { name: 'Messages' }).getByRole('button').first();
  await expect(hit).toContainText('bakery');
  await hit.click();
  await expect(page.locator('.bubble-row.flash')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.bubble-row.flash')).toContainText('bakery');
});

async function touch(page: Page, selector: string, steps: Array<{ type: 'pointerdown' | 'pointermove' | 'pointerup'; dx?: number; wait?: number }>): Promise<void> {
  const box = await page.locator(selector).last().boundingBox();
  const x = box!.x + 20;
  const y = box!.y + box!.height / 2;
  for (const s of steps) {
    await page.locator(selector).last().evaluate((el, a) => {
      el.dispatchEvent(new PointerEvent(a.type, { pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true, cancelable: true, clientX: a.x + (a.dx ?? 0), clientY: a.y }));
    }, { type: s.type, x, y, dx: s.dx });
    if (s.wait) await page.waitForTimeout(s.wait);
  }
}

test('message interactions: click for actions, reply from the sheet, select several, swipe to reply, quick forward', async ({ page }, info) => {
  const tag = info.project.name;
  await openChat(page);
  const box = page.getByRole('textbox', { name: 'Message' });
  await box.fill(`first test line ${tag}`);
  await page.getByRole('button', { name: 'Send' }).click();
  await box.fill(`second test line ${tag}`);
  await page.getByRole('button', { name: 'Send' }).click();
  const second = page.locator('.bubble', { hasText: `second test line ${tag}` }).last();
  await expect(second).toBeVisible();

  // A plain click opens what can be done with the message.
  await second.locator('.text').click();
  await expect(page.getByRole('button', { name: 'Reply' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More reactions' })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-message-menu.png` });
  await page.getByRole('button', { name: 'Reply' }).click();
  await expect(page.locator('.reply-bar')).toContainText(`second test line ${tag}`);
  await page.getByRole('button', { name: 'Cancel reply' }).click();

  // Long press picks it; a tap on another one adds it.
  await touch(page, `.bubble:has-text("second test line ${tag}")`, [{ type: 'pointerdown', wait: 1000 }, { type: 'pointerup' }]);
  await expect(page.getByRole('toolbar', { name: 'Selected messages' })).toContainText('1 selected');
  await page.locator('.bubble', { hasText: `first test line ${tag}` }).last().locator('.text').click();
  await expect(page.getByRole('toolbar', { name: 'Selected messages' })).toContainText('2 selected');
  await page.screenshot({ path: `test-results/${info.project.name}-message-selected.png` });
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('toolbar', { name: 'Selected messages' })).toHaveCount(0);

  // Swipe to the right replies.
  await touch(page, `.bubble:has-text("second test line ${tag}")`, [{ type: 'pointerdown' }, { type: 'pointermove', dx: 40 }, { type: 'pointermove', dx: 130 }, { type: 'pointerup', dx: 130 }]);
  await expect(page.locator('.reply-bar')).toContainText(`second test line ${tag}`);
  await page.getByRole('button', { name: 'Cancel reply' }).click();

  // Pictures have a forward button beside them.
  await page.locator('input[type=file][accept="image/*,video/*"]').first().setInputFiles('tests/fixtures/face.png');
  await page.getByRole('button', { name: 'Send' }).click();
  const fwd = page.getByRole('button', { name: 'Forward', exact: true }).last();
  await expect(fwd).toBeVisible();
  await fwd.click();
  await expect(page.getByText('Forward to')).toBeVisible();
});

test('Signal sticker packs: search, open a pack, send a sticker', async ({ page }, info) => {
  await openChat(page);
  await toggle(page).click();
  await panel(page).getByRole('tab', { name: 'Stickers' }).click();
  await panel(page).getByRole('tab', { name: 'Signal packs' }).click();
  await panel(page).getByRole('searchbox', { name: 'Search Signal packs' }).fill('scooby');
  const pack = panel(page).locator('.sig-pack').first();
  await expect(pack).toBeVisible({ timeout: 30_000 });
  await expect(pack).toBeEnabled({ timeout: 30_000 });
  await expect.poll(() => pack.locator('img').count(), { timeout: 30_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: `test-results/${info.project.name}-signal-packs.png` });
  await pack.click();
  await expect(panel(page).getByRole('button', { name: 'Back to the packs' })).toBeVisible();
  const tile = panel(page).locator('.mp-grid.stickers .mp-tile').first();
  await expect.poll(() => tile.locator('img').count(), { timeout: 30_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: `test-results/${info.project.name}-signal-pack.png` });
  const before = await page.locator('img[alt^="sticker-signal-"]').count();
  await tile.dispatchEvent('click');
  await expect(page.locator('img[alt^="sticker-signal-"]')).toHaveCount(before + 1, { timeout: 30_000 });
  await expect.poll(() => page.locator('img[alt^="sticker-signal-"]').last().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
});

test.describe('without cookies', () => {
  test.use({ serviceWorkers: 'block' });

  test('sign-in explains when the browser does not keep the session cookie', async ({ page }) => {
    // A browser that blocks cookies: the sign-in works but the next request carries no session, so the server answers 401.
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' }));
    await page.goto('/');
    await page.locator('#u').fill(process.env.EMBER_USER ?? 'me');
    await page.locator('#p').fill(process.env.EMBER_PASS ?? 'password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('did not keep the sign-in');
    await expect(page.getByRole('alert')).toContainText('Block All Cookies');
    await expect(page.locator('#u')).toBeVisible();
  });
});
