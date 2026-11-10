import { api } from './api';

/**
 * Web push, the same channel the Hearth web app uses. On iOS and iPadOS (16.4 and later) it only exists for an app added to the Home Screen, and
 * the permission can only be asked for from a tap; both are explained in the settings row instead of failing quietly.
 */
export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on' | 'server-off' | 'unregistered' | 'unavailable';

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
    const reg = await pushRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub || Notification.permission !== 'granted') return 'off';
    const status = await api.pushStatus(sub.endpoint);
    if (!status.enabled) return 'server-off';
    return status.registered ? 'on' : 'unregistered';
  } catch {
    return 'unavailable';
  }
}

export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('The system did not grant notification permission. Open Notification help for the next steps.');
  const { enabled, key } = await api.pushKey();
  if (!enabled) throw new Error('This server has no push notifications set up.');
  const reg = await pushRegistration();
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBuffer(key) }));
  await api.pushSubscribe(sub.toJSON());
}

export async function disablePush(): Promise<void> {
  const reg = await pushRegistration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
}

/** A missing worker must not leave the settings waiting indefinitely. */
async function pushRegistration(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Notifications are still starting. Reload Ember and try again.')), 5000); }),
    ]);
  } finally { clearTimeout(timer); }
}
