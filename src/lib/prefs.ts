import { create } from 'zustand';

/** Settings kept on this browser. Everything is read and written defensively: storage can be blocked (private windows, some iOS modes). */
export interface Prefs {
  theme: 'system' | 'light' | 'dark' | 'black';
  /** The accent colour as "#rrggbb", or empty for Ember's own orange. */
  accent: string;
  wallpaper: 'doodle' | 'gradient' | 'dots' | 'plain' | 'photo';
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
const DEFAULTS: Prefs = { theme: 'system', accent: '', wallpaper: 'doodle', wallpaperDim: 25, wallpaperPhoto: 0, enterSends: false, sounds: true, spellcheck: true, mirrorSelf: true, flipFront: 'auto', crashReports: true, sendHd: false, nudgeButton: typeof window === 'undefined' || window.innerWidth >= 480, messageSound: 'ember', callSound: 'ember', micId: '', camId: '', speakerId: '', giphyKey: '', imgurId: '' };

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
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
