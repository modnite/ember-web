import { deviceId } from './device';

export type Frame = { t: string } & Record<string, unknown>;
type Listener = (frame: Frame) => void;
type StateListener = (connected: boolean) => void;

/**
 * The one WebSocket to the Hearth server (`/ws`). It reconnects by itself with a growing pause, tells the app when it is up or down, and hands
 * every frame to the listeners. A phone that wakes up (visibilitychange, online) reconnects at once instead of waiting out the pause: browsers
 * on iOS suspend sockets of pages in the background, so this is what keeps a chat current after switching apps.
 */
export class Realtime {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<StateListener>();
  private retry = 0;
  private timer: number | null = null;
  private wanted = false;
  private pingTimer: number | null = null;
  connected = false;

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onState(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  start(): void {
    this.wanted = true;
    this.open();
    document.addEventListener('visibilitychange', this.wake);
    window.addEventListener('online', this.wake);
    window.addEventListener('pageshow', this.wake);
  }

  stop(): void {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.wake);
    window.removeEventListener('online', this.wake);
    window.removeEventListener('pageshow', this.wake);
    if (this.timer !== null) window.clearTimeout(this.timer);
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    this.timer = this.pingTimer = null;
    this.ws?.close();
    this.ws = null;
    this.set(false);
  }

  send(frame: Frame): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame));
  }

  private wake = (): void => {
    if (!this.wanted || document.visibilityState === 'hidden') return;
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.retry = 0;
    this.open();
  };

  private set(v: boolean): void {
    if (this.connected === v) return;
    this.connected = v;
    for (const fn of this.stateListeners) fn(v);
  }

  private open(): void {
    if (!this.wanted) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/ws?device=${encodeURIComponent(deviceId())}`);
    this.ws = ws;
    ws.onmessage = (e) => {
      let frame: Frame;
      try {
        frame = JSON.parse(String(e.data)) as Frame;
      } catch {
        return;
      }
      if (frame.t === 'ready') {
        this.retry = 0;
        this.set(true);
      }
      for (const fn of this.listeners) fn(frame);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.set(false);
      if (!this.wanted) return;
      const wait = Math.min(15_000, 600 * 2 ** this.retry++);
      this.timer = window.setTimeout(() => this.open(), wait);
    };
    ws.onerror = () => ws.close();
    // A socket that stalls without closing (a phone changing networks) is noticed by a ping the server answers.
    if (this.pingTimer === null) this.pingTimer = window.setInterval(() => this.send({ t: 'ping' }), 25_000);
  }
}

export const realtime = new Realtime();
