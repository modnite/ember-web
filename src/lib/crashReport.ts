import { api } from './api';
import { usePrefs } from './prefs';

declare const __APP_VERSION__: string;

/** Sends uncaught errors to the Hearth server this app came from, where an administrator reads them (Crashes in the admin panel). Five per page load, each error once. */
const seen = new Set<string>();

function platform(): string {
  const ua = navigator.userAgent;
  const browser = /Firefox\/([\d.]+)/.exec(ua)?.[0] ?? /Edg\/([\d.]+)/.exec(ua)?.[0] ?? /Chrome\/([\d.]+)/.exec(ua)?.[0] ?? /Version\/([\d.]+).*Safari/.exec(ua)?.[0] ?? 'browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` on ${os}` : ''}`.slice(0, 80);
}

export function reportError(error: unknown, extra: Record<string, unknown> = {}): void {
  if (!usePrefs.getState().crashReports || seen.size >= 5) return;
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : (() => { try { return JSON.stringify(error); } catch { return String(error); } })());
  const message = `${err.name}: ${err.message}`.slice(0, 2000);
  const key = `${message}|${(err.stack ?? '').split('\n').slice(0, 3).join('|')}`;
  if (seen.has(key)) return;
  seen.add(key);
  void api.crashReport({
    source: 'ember-web', kind: 'error', appVersion: __APP_VERSION__, platform: platform(), message, stack: err.stack ?? '', at: Date.now(),
    context: { page: location.hash.slice(0, 40), installed: matchMedia('(display-mode: standalone)').matches, ...extra },
  }).catch(() => undefined);
}

export function installCrashReporter(): void {
  window.addEventListener('error', (e) => {
    if (e.filename && !e.filename.startsWith(location.origin)) return;
    if (/ResizeObserver loop/.test(e.message)) return;
    reportError(e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}
