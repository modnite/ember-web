// Emoji look the same on every device: the Apple pictures Hearth uses, shown in place of the characters.
// The file name is the emoji's code points in hex joined by "-" ("1f600", "2764-fe0f"), so no table is needed to find a picture.

/** Flags, keycaps, and pictographs with a variation selector, joiner or skin tone. */
const SEG = /(\p{RI}\p{RI}|\p{Extended_Pictographic}(?:[️‍\p{Emoji_Modifier}]|\p{Extended_Pictographic})*|[0-9#*]️?⃣)/gu;

export interface EmojiSegment {
  emoji: boolean;
  value: string;
}

const FIRST = /^(?:\p{RI}\p{RI}|\p{Extended_Pictographic}|[0-9#*]️?⃣)/u;
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** Text in pieces: each emoji on its own (two in a row are two pictures), the words between them as they are. */
export function splitEmoji(text: string): EmojiSegment[] {
  const out: EmojiSegment[] = [];
  const push = (emoji: boolean, value: string): void => {
    const last = out[out.length - 1];
    if (!emoji && last && !last.emoji) last.value += value;
    else out.push({ emoji, value });
  };
  if (segmenter) {
    for (const { segment } of segmenter.segment(text)) push(FIRST.test(segment), segment);
    return out;
  }
  // Without grapheme splitting (an old browser) a run of emoji stays together and falls back to the characters.
  let last = 0;
  for (const m of text.matchAll(SEG)) {
    const at = m.index ?? 0;
    if (at > last) push(false, text.slice(last, at));
    push(true, m[0]);
    last = at + m[0].length;
  }
  if (last < text.length) push(false, text.slice(last));
  return out;
}

const hex = (s: string): string => Array.from(s, (c) => c.codePointAt(0)!.toString(16)).join('-');

/** Picture addresses to try in order: with the variation selector as typed, then without it, then with it added (the set names them either way). */
export function emojiUrls(emoji: string): string[] {
  const bare = emoji.replace(/️/g, '');
  const names = [hex(emoji), hex(bare), hex(bare) + '-fe0f'];
  return [...new Set(names)].map((n) => `/emoji/apple/64/${n}.png`);
}

/** True when the text is only one to three emoji (and spaces): such a message is drawn large, like in the messengers. */
export function isJumbo(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const parts = splitEmoji(t);
  const emoji = parts.filter((p) => p.emoji);
  return emoji.length >= 1 && emoji.length <= 3 && parts.every((p) => p.emoji || !p.value.trim());
}
