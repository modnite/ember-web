import { api } from './api';

/**
 * Web push, the same channel the Hearth web app uses. On iOS and iPadOS (16.4 and later) it only exists for an app added to the Home Screen, and
 * the permission can only be asked for from a tap; both are explained in the settings row instead of failing quietly.
 */
export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on' | 'server-off';

const urlBase64ToBuffer = (s: string): ArrayBuffer => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
};

export async function pushState(installed: boolean, ios: boolean): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return ios && !installed ? 'needs-install' : 'unsupported';
  if (ios && !installed) return 'needs-install';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const info = await api.pushKey();
    if (!info.enabled) return 'server-off';
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed. You can change that in the browser or phone settings.');
  const { enabled, key } = await api.pushKey();
  if (!enabled) throw new Error('This server has no push notifications set up.');
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBuffer(key) }));
  await api.pushSubscribe(sub.toJSON());
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
}
