// The emoji picker's catalog: the ~1000 most common emoji from
// emoji-datasource-apple. Within each category entries are ordered by
// sort_order (most common first) and trimmed to a quota so the common
// categories get the most room; the quotas are then scaled down so the whole
// catalog fits in MAX_TOTAL items.
import data from 'emoji-datasource-apple/emoji.json';

interface RawEmoji {
  unified: string;
  native?: string;
  name?: string;
  short_name?: string;
  short_names?: string[];
  category: string;
  sort_order: number;
  has_img_apple?: boolean;
  obsoleted_by?: string;
}

export interface EmojiItem {
  native: string;
  name: string;
  file: string;
  keywords: string[];
}

/** Display order and maximum slots per category (common groups get more). */
const QUOTAS: ReadonlyArray<readonly [string, number]> = [
  ['Smileys & Emotion', 150],
  ['People & Body', 250],
  ['Animals & Nature', 120],
  ['Food & Drink', 120],
  ['Travel & Places', 120],
  ['Activities', 80],
  ['Objects', 120],
  ['Symbols', 80],
  ['Flags', 40],
];

/** Overall cap for the catalog; the quotas above add up to more than this. */
const MAX_TOTAL = 1000;

/** Skin-tone modifier codepoints: only the base emoji is offered, no tones. */
const TONE = /^(1f3fb|1f3fc|1f3fd|1f3fe|1f3ff)$/;

/** Turn a "1f389" / "2764-fe0f" unified value into the native emoji string. */
function toNative(unified: string): string | null {
  try {
    return unified
      .split('-')
      .map((hex) => String.fromCodePoint(parseInt(hex, 16)))
      .join('');
  } catch {
    return null; // malformed codepoint in the dataset
  }
}

function toItem(e: RawEmoji): EmojiItem {
  const file = e.unified.toLowerCase();
  return {
    native: e.native ?? toNative(e.unified) ?? '',
    name: e.name || e.short_name || file,
    file,
    keywords: e.short_names?.length ? [...e.short_names] : e.short_name ? [e.short_name] : [],
  };
}

// Collect the eligible emoji per category: Apple image available, not
// obsoleted, and no skin-tone codepoint (tone variants are not included).
const byCategory = new Map<string, RawEmoji[]>();
for (const e of data as RawEmoji[]) {
  if (e.has_img_apple === false || e.obsoleted_by) continue;
  if (e.unified.toLowerCase().split('-').some((hex) => TONE.test(hex))) continue;
  if (!e.native && !toNative(e.unified)) continue;
  const list = byCategory.get(e.category);
  if (list) list.push(e);
  else byCategory.set(e.category, [e]);
}
for (const list of byCategory.values()) list.sort((a, b) => a.sort_order - b.sort_order);

// Scale the quotas down to MAX_TOTAL and give the rounding remainder to the
// categories with the largest fractions, so every category stays represented.
const totalQuota = QUOTAS.reduce((sum, [, quota]) => sum + quota, 0);
const slots = QUOTAS.map(([category, quota]) => {
  const exact = (quota * MAX_TOTAL) / totalQuota;
  return { category, count: Math.floor(exact), remainder: exact % 1 };
});
let spare = MAX_TOTAL - slots.reduce((sum, s) => sum + s.count, 0);
for (const s of [...slots].sort((a, b) => b.remainder - a.remainder)) {
  if (spare <= 0) break;
  s.count += 1;
  spare -= 1;
}

/** The curated catalog, grouped by category (empty categories are omitted). */
export const emojiCatalog: Array<{ category: string; items: EmojiItem[] }> = [];
for (const { category, count } of slots) {
  const raw = byCategory.get(category);
  if (!raw?.length || count <= 0) continue;
  emojiCatalog.push({ category, items: raw.slice(0, count).map(toItem) });
}

/** Every catalog emoji in display order, flattened for search. */
export const allEmojis: EmojiItem[] = emojiCatalog.flatMap((group) => group.items);
