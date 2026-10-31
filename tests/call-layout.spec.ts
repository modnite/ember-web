import { expect, test, type Page } from '@playwright/test';

// Needs the dev server (EMBER_URL), so the page can import the call store as a module. A poster image stands in for the video.
async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#u').fill(process.env.EMBER_USER ?? 'me');
  await page.locator('#p').fill(process.env.EMBER_PASS ?? 'password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: /New chat/ })).toBeVisible();
}

async function fakeCall(page: Page, n: number, minimized = false): Promise<void> {
  await page.evaluate(async ({ n, minimized }) => {
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path); // eslint-disable-line
    const { useCall } = await load('/src/lib/call.ts');
    const colors = ['#2a6', '#a42', '#46b', '#b84', '#7a3', '#d37', '#389', '#c52', '#5a8'];
    const track = (i: number) => {
      const c = document.createElement('canvas');
      c.width = 640; c.height = 480;
      const g = c.getContext('2d')!;
      g.fillStyle = colors[i % colors.length]!; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.font = '48px sans-serif'; g.fillText('P' + i + ' LEFT', 20, 80); g.fillText('RIGHT', 480, 460);
      const url = c.toDataURL();
      return { attach: (el: HTMLVideoElement) => { el.poster = url; return el; }, detach: () => undefined };
    };
    const people = Array.from({ length: n }, (_, i) => ({ identity: `u${i}:d`, userId: `u${i}`, name: i === 0 ? 'Me' : `Person ${i}`, isLocal: i === 0, micOn: i % 3 !== 2, camOn: true, speaking: i === 1, camera: track(i) as never }));
    useCall.setState({ phase: 'connected', roomId: (await load('/src/lib/store.ts')).useStore.getState().rooms[0]!.id, startedAt: Date.now() - 65000, people, minimized, micOn: true, camOn: true, canFlip: true });
  }, { n, minimized });
}

for (const n of [2, 3, 5, 7]) {
  test(`call layout with ${n} people`, async ({ page }, info) => {
    await signIn(page);
    await fakeCall(page, n);
    await expect(page.locator('.tile')).toHaveCount(n);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/${info.project.name}-call-${n}.png` });
    const tiles = await page.locator('.tile').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    for (const [w, h] of tiles) { expect(w!).toBeGreaterThan(140); expect(h!).toBeGreaterThan(140); }
  });
}

test('fit button and minimized window', async ({ page }, info) => {
  await signIn(page);
  await fakeCall(page, 3);
  const first = page.locator('.tile').nth(1);
  await expect(first).not.toHaveClass(/contain/);
  await first.getByRole('button', { name: /Fit/ }).click();
  await expect(first).toHaveClass(/contain/);
  await page.getByRole('button', { name: /Back to your chats/ }).click();
  await expect(page.locator('.call.mini')).toBeVisible();
  await expect(page.getByRole('button', { name: /New chat/ })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-call-mini.png` });
  await page.locator('.mini-view').click();
  await expect(page.locator('.tiles')).toBeVisible();
});
