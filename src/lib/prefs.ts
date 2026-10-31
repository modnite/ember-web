import { create } from 'zustand';

/** Settings kept on this browser. Everything is read and written defensively: storage can be blocked (private windows, some iOS modes). */
export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  enterSends: boolean;
  sounds: boolean;
  spellcheck: boolean;
  /** See your own camera like a mirror in calls (others always see you as you are). */
  mirrorSelf: boolean;
  /** Flip the front camera before sending (for phones whose camera hands over an already flipped picture). Auto means: Samsung models. */
  flipFront: 'auto' | 'on' | 'off';
  crashReports: boolean;
}

const KEY = 'ember.prefs';
const DEFAULTS: Prefs = { theme: 'system', enterSends: false, sounds: true, spellcheck: true, mirrorSelf: true, flipFront: 'auto', crashReports: true };

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

/** Apply the theme to the page (and the colour of the browser bar). */
export function applyTheme(theme: Prefs['theme']): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', dark ? '#16110E' : '#FFFBF8');
}
