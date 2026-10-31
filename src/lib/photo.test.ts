import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_QUICK, noteReaction, quickReactions } from './emojiUse';
import { fitSize, jpegName, photoEdge, photoJpeg } from './photo';

describe('photo quality', () => {
  it('uses the same numbers as the Android app', () => {
    expect(photoEdge('standard')).toBe(1600);
    expect(photoEdge('hd')).toBe(4096);
    expect(photoJpeg('standard')).toBe(0.8);
    expect(photoJpeg('hd')).toBe(0.92);
  });
  it('never enlarges, and keeps the proportions when it shrinks', () => {
    expect(fitSize(800, 600, 1600)).toEqual([800, 600]);
    expect(fitSize(4000, 3000, 1600)).toEqual([1600, 1200]);
    expect(fitSize(3000, 4000, 1600)).toEqual([1200, 1600]);
    expect(fitSize(10000, 1, 1600)).toEqual([1600, 1]);
  });
  it('renames a converted picture to .jpg', () => {
    expect(jpegName('holiday.png')).toBe('holiday.jpg');
    expect(jpegName('a.b.heic')).toBe('a.b.jpg');
    expect(jpegName('noext')).toBe('noext.jpg');
    expect(jpegName('.png')).toBe('photo.jpg');
  });
});

describe('quick reactions', () => {
  beforeEach(() => localStorage.clear());
  it('starts with the usual six', () => {
    expect(quickReactions()).toEqual(DEFAULT_QUICK);
  });
  it('puts the ones you use most first and fills the rest with the usual ones', () => {
    noteReaction('🔥');
    noteReaction('🔥');
    noteReaction('🎉');
    expect(quickReactions()).toEqual(['🔥', '🎉', '👍', '❤️', '😂', '😮']);
  });
  it('keeps six and does not repeat one', () => {
    for (const e of ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥']) noteReaction(e);
    noteReaction('🔥');
    const q = quickReactions();
    expect(q).toHaveLength(6);
    expect(new Set(q).size).toBe(6);
    expect(q[0]).toBe('🔥');
  });
});
