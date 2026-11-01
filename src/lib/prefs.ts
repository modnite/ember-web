import { create } from 'zustand';

/** Settings kept on this browser. Everything is read and written defensively: storage can be blocked (private windows, some iOS modes). */
export interface Prefs {
  theme: 'system' | 'light' | 'dark' | 'black';
  /** The accent colour as "#rrggbb", or empty for Ember's own orange. */
  accent: string;
  /** The flat colour under the doodles: the chat's own, a wash of the accent, or a photo. */
  wallpaper: 'default' | 'accent' | 'photo';
  /** The doodles over the flat colour. */
  doodles: boolean;
  /** How much a photo wallpaper is darkened, 0 to 70. */
  wallpaperDim: number;
  /** Counts photo changes, so the page redraws the wallpaper. */
  wallpaperPhoto: number;
  enterSends: boolean;
  sounds: boolean;
  spellcheck: boolean;
  /** See your own camera like a mirror in calls (others always see you as you are). */
  mirrorSelf: boolean;
  /** Flip the front camera before sending (for phones whose camera hands over an already flipped picture). Auto means: Samsung models. */
  flipFront: 'auto' | 'on' | 'off';
  crashReports: boolean;
  /** Photos go out in HD (more detail, larger) instead of Standard. */
  sendHd: boolean;
  /** A Nudge button in the top bar of every chat. Off puts Nudge in the attach menu. */
  nudgeButton: boolean;
  /** The desktop app: system notices for new messages, nudges and calls, and a flashing taskbar button. */
  desktopAlerts: boolean;
  /** The sound for a new message and for a ring: Ember's own, none, or a file you chose. */
  messageSound: 'ember' | 'none' | 'file';
  callSound: 'ember' | 'none' | 'file';
  /** The devices chosen for calls (empty: the browser's own choice). */
  micId: string;
  camId: string;
  speakerId: string;
  /** Your own keys for the GIF services that need one (kept in this browser only). */
  giphyKey: string;
  imgurId: string;
}

const KEY = 'ember.prefs';
const DEFAULTS: Prefs = { theme: 'system', accent: '', wallpaper: 'default', doodles: true, wallpaperDim: 0, wallpaperPhoto: 0, enterSends: false, sounds: true, spellcheck: true, mirrorSelf: true, flipFront: 'auto', crashReports: true, sendHd: false, nudgeButton: true, desktopAlerts: true, messageSound: 'ember', callSound: 'ember', micId: '', camId: '', speakerId: '', giphyKey: '', imgurId: '' };

/** The first wallpaper choices (doodles, gradient, dots, plain) become a flat colour with the doodles switched on or off. */
function migrate(saved: Record<string, unknown>): Record<string, unknown> {
  const w = saved.wallpaper;
  if (w === 'doodle' || w === 'dots') return { ...saved, wallpaper: 'default', doodles: true };
  if (w === 'plain') return { ...saved, wallpaper: 'default', doodles: false };
  if (w === 'gradient') return { ...saved, wallpaper: 'accent', doodles: false };
  return saved;
}

/** The Nudge button was left out of the top bar on narrow screens, and every browser kept that choice. It is on for everyone once; after that it is theirs. */
function nudgeInBar(saved: Record<string, unknown>): Record<string, unknown> {
  if (saved.nudgeInBarDone) return saved;
  return { ...saved, nudgeButton: true, nudgeInBarDone: true };
}

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...(nudgeInBar(migrate(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>)) as Partial<Prefs>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const usePrefs = create<Prefs & { set: (p: Partial<Prefs>) => void }>((set, get) => ({
  ...load(),
  set: (p) => {
    set(p);
    const { set: _s, ...prefs } = get();
    void _s;
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* not saved: still applied for this visit */
    }
  },
}));
