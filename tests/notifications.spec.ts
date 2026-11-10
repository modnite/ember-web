import { expect, test } from '@playwright/test';
for (const mode of ['light', 'dark'] as const) {
  test(`iOS notification recovery in ${mode}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      let permission = 'denied';
      Object.defineProperty(window, 'Notification', { configurable: true, value: {get permission(){return permission},requestPermission:async()=>{permission='granted';return permission}} });
      Object.defineProperty(window, 'PushManager', { configurable:true, value: class {} });
      const sub = {endpoint:'https://push.example/fixture',toJSON:()=>({endpoint:'https://push.example/fixture'})};
      Object.defineProperty(navigator, 'serviceWorker', {configurable:true,value:{ready:Promise.resolve({pushManager:{getSubscription:async()=>sub}})}});
    });
    await page.route('**/api/push/**', async (route) => {
      const url=route.request().url();
      await route.fulfill({json:url.includes('/key')?{enabled:true,key:'AAAA'}:url.includes('/status')?{enabled:true,registered:true,count:1}:{ok:true}});
    });
    await page.goto('/tests/notifications.html');
    await page.evaluate((mode)=>{document.documentElement.dataset.theme=mode},mode);
    await page.getByRole('button',{name:'Enable notifications',exact:true}).click();
    await expect(page.getByRole('switch',{name:'Message and call alerts'})).toBeChecked();
    await page.getByRole('button',{name:'Notification help',exact:true}).click();
    await expect(page.getByText(/If no prompt appears/)).toBeVisible();
    await page.locator('.sheet').evaluate(async (el) => { await Promise.all(el.getAnimations().map((animation) => animation.finished)); });
    await page.screenshot({path:`test-results/${info.project.name}-notifications-${mode}.png`});
    await page.setViewportSize({width:844,height:390});
    await page.getByRole('button',{name:'Done',exact:true}).scrollIntoViewIfNeeded();
    await page.getByRole('button',{name:'Done',exact:true}).click();
    await expect(page.getByRole('button',{name:'Send a test notification'})).toBeVisible();
  });
}
