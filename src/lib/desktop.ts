/**
 * The Ember desktop app is this web app inside a small native shell. The shell adds what a page cannot do on its own: system notices, a
 * flashing taskbar button and the unread count on its tray icon. In a browser none of this exists and every call here does nothing.
 */
import { usePrefs } from './prefs';

interface Internals {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
}

const internals = (): Internals | null => (window as unknown as { __TAURI_INTERNALS__?: Internals }).__TAURI_INTERNALS__ ?? null;

/** Whether this is the desktop app and not a browser tab. */
export const isDesktop = (): boolean => internals() !== null;

function ask(command: string, args: Record<string, unknown>): void {
  try {
    void internals()?.invoke(command, args).catch(() => undefined);
  } catch {
    /* the shell is not answering: nothing to do */
  }
}

/** A system notice (only shown when the window is not the one being looked at). */
export function desktopNotify(title: string, body: string): void {
  if (!usePrefs.getState().desktopAlerts) return;
  ask('notify_desktop', { title, body });
}

/** Flash the taskbar button until the window is looked at. [critical] keeps flashing, for a nudge or a call. */
export function desktopAttention(critical: boolean): void {
  if (!usePrefs.getState().desktopAlerts) return;
  ask('attention', { critical });
}

/** How many unread messages there are: shown on the tray icon. */
export function desktopUnread(count: number): void {
  ask('set_unread', { count });
}
