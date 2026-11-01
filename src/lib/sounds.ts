import { usePrefs } from './prefs';
import { loadSound, type SoundSlot } from './soundFiles';

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

export type SoundKind = 'message' | 'send' | 'ring' | 'end' | 'nudge';

/** Play the sound file chosen for a slot. Resolves false when it could not be played (the built-in sound is used instead). */
async function playFile(slot: SoundSlot, loop = false): Promise<HTMLAudioElement | null> {
  const f = await loadSound(slot);
  if (!f) return null;
  const a = new Audio(f.url);
  a.loop = loop;
  try {
    await a.play();
    return a;
  } catch {
    return null;
  }
}

const slotOf = (kind: SoundKind): SoundSlot | null => (kind === 'message' ? 'message' : kind === 'ring' ? 'call' : null);

/** Try a sound the way it will be heard: the chosen file, none, or Ember's own. */
export function previewSound(slot: SoundSlot): void {
  const choice = usePrefs.getState()[slot === 'message' ? 'messageSound' : 'callSound'];
  if (choice === 'none') return;
  if (choice === 'file') void playFile(slot).then((a) => { if (!a) playBuiltIn(slot === 'message' ? 'message' : 'ring'); });
  else playBuiltIn(slot === 'message' ? 'message' : 'ring');
}

/** The nudge sound: the one recording the Hearth web app and the Android app play. Never more than three at once, and not closer than 0.6 seconds. */
const nudgePlayers = new Set<HTMLAudioElement>();
let lastNudgeAt = 0;
function playNudgeFile(): void {
  const now = Date.now();
  if (now - lastNudgeAt < 600 || nudgePlayers.size >= 3) return;
  lastNudgeAt = now;
  const a = new Audio('/sounds/nudge.mp3');
  nudgePlayers.add(a);
  const done = (): void => { nudgePlayers.delete(a); };
  a.addEventListener('ended', done);
  a.addEventListener('error', done);
  a.play().catch(() => { done(); playBuiltIn('nudge'); });
}

export function playSound(kind: SoundKind): void {
  const prefs = usePrefs.getState();
  if (!prefs.sounds) return;
  if (kind === 'nudge') { playNudgeFile(); return; }
  const slot = slotOf(kind);
  if (slot) {
    const choice = slot === 'message' ? prefs.messageSound : prefs.callSound;
    if (choice === 'none') return;
    if (choice === 'file') {
      void playFile(slot).then((a) => { if (!a) playBuiltIn(kind); });
      return;
    }
  }
  playBuiltIn(kind);
}

function playBuiltIn(kind: SoundKind): void {
  const c = context();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;
  if (kind === 'message') {
    tone(c, 880, t, 0.16, 0.12);
    tone(c, 1175, t + 0.09, 0.2, 0.1);
  } else if (kind === 'send') {
    tone(c, 660, t, 0.09, 0.05);
  } else if (kind === 'nudge') {
    for (let i = 0; i < 4; i++) tone(c, 180 + (i % 2) * 40, t + i * 0.09, 0.08, 0.16);
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
  const prefs = usePrefs.getState();
  if (!prefs.sounds || prefs.callSound === 'none') return () => undefined;
  if (prefs.callSound === 'file') {
    let stop = false;
    let audio: HTMLAudioElement | null = null;
    void playFile('call', true).then((a) => {
      audio = a;
      if (stop) a?.pause();
      if (!a && !stop) playBuiltIn('ring');
    });
    return () => { stop = true; audio?.pause(); };
  }
  playSound('ring');
  const id = window.setInterval(() => playSound('ring'), 2600);
  return () => window.clearInterval(id);
}
