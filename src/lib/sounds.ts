import { usePrefs } from './prefs';

/**
 * Small synthesized sounds (no files to download). iOS and other browsers only let a page make sound after a tap, so the audio context is
 * created and resumed on the first touch or key, and sounds asked for before that are dropped quietly.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call once at start: wakes the audio context at the first gesture. */
export function unlockAudio(): void {
  const wake = (): void => {
    const c = context();
    if (c && c.state === 'suspended') void c.resume();
    if (c && c.state === 'running') for (const e of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(e, wake);
  };
  for (const e of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(e, wake, { passive: true });
}

function tone(c: AudioContext, freq: number, start: number, length: number, gain: number): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(g).connect(c.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

export type SoundKind = 'message' | 'send' | 'ring' | 'end';

export function playSound(kind: SoundKind): void {
  if (!usePrefs.getState().sounds) return;
  const c = context();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;
  if (kind === 'message') {
    tone(c, 880, t, 0.16, 0.12);
    tone(c, 1175, t + 0.09, 0.2, 0.1);
  } else if (kind === 'send') {
    tone(c, 660, t, 0.09, 0.05);
  } else if (kind === 'end') {
    tone(c, 520, t, 0.14, 0.09);
    tone(c, 390, t + 0.12, 0.2, 0.09);
  } else {
    for (let i = 0; i < 2; i++) {
      tone(c, 740, t + i * 0.5, 0.18, 0.12);
      tone(c, 988, t + i * 0.5 + 0.14, 0.24, 0.12);
    }
  }
}

/** A ring that repeats until stopped. Returns the stop function. */
export function ringUntilStopped(): () => void {
  playSound('ring');
  const id = window.setInterval(() => playSound('ring'), 2600);
  return () => window.clearInterval(id);
}
