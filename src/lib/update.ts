import { registerSW } from 'virtual:pwa-register';

/**
 * The service worker is registered with a prompt, not an automatic swap: when a new version has been downloaded the app shows a bar, and the
 * person reloads when it suits them (never in the middle of typing a message).
 */
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let readyFn: (() => void) | null = null;
let ready = false;

export function startServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      ready = true;
      readyFn?.();
    },
    onRegisteredSW(_url, reg) {
      // Look for a new version every hour, and when the app comes back to the screen.
      if (!reg) return;
      window.setInterval(() => void reg.update().catch(() => undefined), 3_600_000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update().catch(() => undefined); });
    },
  });
}

export function onUpdateReady(fn: () => void): void {
  readyFn = fn;
  if (ready) fn();
}

export function reloadForUpdate(): void {
  if (updateSW) void updateSW(true);
  else location.reload();
}
