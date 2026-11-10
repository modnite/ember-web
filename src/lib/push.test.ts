import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { enablePush, pushState } from './push';
vi.mock('./api', () => ({ api: { pushKey: vi.fn(), pushStatus: vi.fn(), pushSubscribe: vi.fn() } }));
const subscription = { endpoint: 'https://push.example/sub', toJSON: () => ({ endpoint: 'https://push.example/sub' }) };
function install(permission: NotificationPermission, existing: unknown = subscription) {
  const requestPermission = vi.fn().mockResolvedValue('granted');
  vi.stubGlobal('Notification', { permission, requestPermission });
  vi.stubGlobal('PushManager', class {});
  const subscribe = vi.fn().mockResolvedValue(subscription);
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(existing), subscribe } }) } });
  return { requestPermission, subscribe };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.pushKey).mockResolvedValue({ enabled: true, key: 'AAAA' }); vi.mocked(api.pushStatus).mockResolvedValue({ enabled: true, registered: true, count: 1 }); });
afterEach(() => { vi.unstubAllGlobals(); delete (navigator as unknown as Record<string, unknown>).serviceWorker; vi.useRealTimers(); });
describe('notification setup', () => {
  it('requires Home Screen launch on iOS without requesting permission', async () => {
    const { requestPermission } = install('denied');
    expect(await pushState(false, true)).toBe('needs-install');
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('reports the platform block without inferring a user decision', async () => {
    install('denied'); expect(await pushState(true, true)).toBe('blocked');
  });
  it('checks the server registration rather than trusting a local subscription', async () => {
    install('granted'); vi.mocked(api.pushStatus).mockResolvedValue({ enabled: true, registered: false, count: 0 });
    expect(await pushState(true, true)).toBe('unregistered');
    expect(api.pushStatus).toHaveBeenCalledWith(subscription.endpoint);
  });
  it('does not show notifications as enabled when the server cannot be checked', async () => {
    install('granted'); vi.mocked(api.pushStatus).mockRejectedValue(new Error('offline'));
    expect(await pushState(true, true)).toBe('unavailable');
  });
  it('requests permission synchronously in the tap before any network request', async () => {
    const { requestPermission } = install('denied');
    const pending = enablePush();
    expect(requestPermission).toHaveBeenCalledOnce(); expect(api.pushKey).not.toHaveBeenCalled();
    await pending; expect(api.pushSubscribe).toHaveBeenCalledWith(subscription.toJSON());
  });
  it('subscribes with visible delivery after permission is granted', async () => {
    const { subscribe } = install('default', null); await enablePush();
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
  });
  it('does not subscribe if the platform refuses permission', async () => {
    const { requestPermission, subscribe } = install('denied'); requestPermission.mockResolvedValue('denied');
    await expect(enablePush()).rejects.toThrow('system did not grant'); expect(subscribe).not.toHaveBeenCalled();
  });
  it('bounds a missing service worker instead of leaving setup hanging', async () => {
    vi.useFakeTimers(); install('granted');
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: new Promise(() => {}) } });
    const pending = pushState(true, true); await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toBe('unavailable');
  });
});
