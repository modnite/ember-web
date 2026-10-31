/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

// The app shell is cached so it opens instantly and offline; /api and /ws are never touched here.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/ws/] }));

// The page decides when to take a new version (a "Reload to update" bar), so the app is never swapped under someone typing.
self.addEventListener('message', (e) => {
  if ((e.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

interface PushPayload {
  title?: string;
  body?: string;
  roomId?: string;
  url?: string;
  tag?: string;
  renotify?: boolean;
  urgent?: boolean;
}

self.addEventListener('push', (event) => {
  let p: PushPayload = {};
  try {
    p = (event.data?.json() ?? {}) as PushPayload;
  } catch {
    p = { title: 'Ember', body: event.data?.text() ?? '' };
  }
  event.waitUntil(
    (async () => {
      // Someone looking at the app already sees the message: no banner on top of it. (iOS requires every push to show a notification
      // in the end, so on WebKit the banner is shown even then; visibility is only trusted where the browser reports it.)
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const focused = windows.some((w) => w.visibilityState === 'visible' && w.focused);
      const isWebKit = /AppleWebKit/.test(self.navigator.userAgent) && !/Chrome|Chromium|Firefox/.test(self.navigator.userAgent);
      if (focused && !isWebKit) return;
      await self.registration.showNotification(p.title || 'Ember', {
        body: p.body || '',
        tag: p.tag || p.roomId || undefined,
        icon: '/icons/icon-192.png',
        badge: '/icons/favicon-32.png',
        data: { roomId: p.roomId, url: p.url },
        requireInteraction: !!p.urgent,
        ...(p.renotify && (p.tag || p.roomId) ? { renotify: true } : {}),
      } as NotificationOptions);
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = (event.notification.data ?? {}) as { roomId?: string };
  const target = d.roomId ? `/#/chat/${d.roomId}` : '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows[0];
      if (open) {
        await open.focus();
        open.postMessage({ type: 'OPEN_ROOM', roomId: d.roomId });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
