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

/** A chat window of the desktop app: the app started to show just one chat. The main window deals with sounds, notices and the unread count. */
export const isSoloWindow = (): boolean => isDesktop() && new URLSearchParams(location.search).has('solo');

function ask(command: string, args: Record<string, unknown>): void {
  try {
    void internals()?.invoke(command, args).catch(() => undefined);
  } catch {
    /* the shell is not answering: nothing to do */
  }
}

/** A system notice (only shown when the window is not the one being looked at). */
export function desktopNotify(title: string, body: string): void {
  if (isSoloWindow() || !usePrefs.getState().desktopAlerts) return;
  ask('notify_desktop', { title, body });
}

/** Flash the taskbar button until the window is looked at. [critical] keeps flashing, for a nudge or a call. */
export function desktopAttention(critical: boolean): void {
  if (isSoloWindow() || !usePrefs.getState().desktopAlerts) return;
  ask('attention', { critical });
}

/** Open a chat in a window of its own (or bring that window to the front). */
export function desktopOpenChat(roomId: string, title: string): void {
  ask('open_chat_window', { roomId, title });
}

/** A chat window names itself after its chat. */
export function desktopSetTitle(title: string): void {
  ask('set_window_title', { title });
}

/** A chat window closes itself. */
export function desktopCloseWindow(): void {
  ask('close_window', {});
}

/** Shake the window a chat is in (its own window, else the main one): a nudge, sent or received. Not held back by the system's reduced motion setting. */
export function desktopShake(roomId: string): void {
  ask('shake_chat', { roomId });
}

/** Chats stop having windows of their own: closes them all and says which chats they showed (the one in use first). */
export async function desktopCloseChatWindows(): Promise<string[]> {
  try {
    const ids = await internals()?.invoke('close_chat_windows', {});
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch {
    return [];
  }
}

/** The page has drawn itself: the shell shows the window it kept hidden until now. */
export function desktopReady(): void {
  ask('window_ready', {});
}

/** The main window is narrow ("thin") for the sign-in page and for a chat list whose chats open in windows of their own, wide otherwise. */
export function desktopLayout(thin: boolean): void {
  if (isSoloWindow()) return;
  ask('set_window_layout', { thin });
}

/** Open the shell's page for choosing another server. */
export function desktopChangeServer(): void {
  ask('open_server_picker', {});
}

/** How many unread messages there are: shown on the tray icon. */
export function desktopUnread(count: number): void {
  if (isSoloWindow()) return;
  ask('set_unread', { count });
}
