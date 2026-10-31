import { Fragment, useState } from 'react';
import { emojiUrls, splitEmoji } from '../lib/emoji';

/** One emoji as its picture. If no picture loads, the character itself is drawn instead, so nothing is ever an empty box. */
export function Emoji({ emoji, size }: { emoji: string; size?: number | string }) {
  const [at, setAt] = useState(0);
  const urls = emojiUrls(emoji);
  if (at >= urls.length) return <span className="emoji-glyph">{emoji}</span>;
  return <img className="emoji" src={urls[at]} alt={emoji} draggable={false} style={size ? { width: size, height: size } : undefined} onError={() => setAt(at + 1)} />;
}

/** Plain text with every emoji swapped for its picture. */
export function EmojiText({ text }: { text: string }) {
  return (
    <>
      {splitEmoji(text).map((seg, i) => (seg.emoji ? <Emoji key={i} emoji={seg.value} /> : <Fragment key={i}>{seg.value}</Fragment>))}
    </>
  );
}
