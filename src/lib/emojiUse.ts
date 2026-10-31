// The six reactions in the message menu are the ones you use most, as in the Android app. Until you have used six, the usual ones fill the rest.

const KEY = 'ember.emojiUse';
export const DEFAULT_QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const KEEP = 60;

function load(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && v > 0) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** Count one use of a reaction. */
export function noteReaction(emoji: string): void {
  const use = load();
  use[emoji] = (use[emoji] ?? 0) + 1;
  const entries = Object.entries(use);
  if (entries.length > KEEP) for (const [k] of entries.sort((a, b) => a[1] - b[1]).slice(0, entries.length - KEEP)) delete use[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(use));
  } catch {
    /* not saved: the menu keeps its usual six */
  }
}

/** The six to show: most used first (ties keep the order they were first used in), then the usual ones for what is left. */
export function quickReactions(): string[] {
  const used = Object.entries(load()).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 6);
  for (const d of DEFAULT_QUICK) if (used.length < 6 && !used.includes(d)) used.push(d);
  return used;
}
