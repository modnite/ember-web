import { create } from 'zustand';

export function firstLookNeeded(marker: string | null, existingPrefs: boolean): boolean {
  return marker === 'pending' || (marker === null && !existingPrefs);
}
function load(): boolean {
  try {
    const pending = firstLookNeeded(localStorage.getItem('ember.appearanceSetup'), localStorage.getItem('ember.prefs') !== null);
    localStorage.setItem('ember.appearanceSetup', pending ? 'pending' : 'done');
    return pending;
  } catch { return true; }
}
export const useAppearanceSetup = create<{ pending: boolean; finish: () => void }>((set) => ({
  pending: load(),
  finish: () => { try { localStorage.setItem('ember.appearanceSetup', 'done'); } catch { /* session-only */ } set({ pending: false }); },
}));
