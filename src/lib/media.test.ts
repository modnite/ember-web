import { describe, expect, it } from 'vitest';
import { emojiUrls, isJumbo, splitEmoji } from './emoji';
import { parse } from './online';

describe('emoji', () => {
  it('splits text around emoji, keeping joined and flag sequences whole', () => {
    expect(splitEmoji('hi 😀 there')).toEqual([{ emoji: false, value: 'hi ' }, { emoji: true, value: '😀' }, { emoji: false, value: ' there' }]);
    expect(splitEmoji('👨‍👩‍👧')).toEqual([{ emoji: true, value: '👨‍👩‍👧' }]);
    expect(splitEmoji('🇸🇪')).toEqual([{ emoji: true, value: '🇸🇪' }]);
    expect(splitEmoji('1️⃣')[0]!.emoji).toBe(true);
    expect(splitEmoji('😀😀').map((p) => p.value)).toEqual(['😀', '😀']);
  });
  it('does not treat plain digits as emoji', () => {
    expect(splitEmoji('call 112').every((p) => !p.emoji)).toBe(true);
  });
  it('finds the picture names the set uses', () => {
    expect(emojiUrls('😀')[0]).toBe('/emoji/apple/64/1f600.png');
    expect(emojiUrls('❤️')).toContain('/emoji/apple/64/2764-fe0f.png');
    expect(emojiUrls('❤')).toContain('/emoji/apple/64/2764-fe0f.png');
  });
  it('draws one to three emoji large and nothing else', () => {
    expect(isJumbo('😀')).toBe(true);
    expect(isJumbo(' 😀 🎉 ')).toBe(true);
    expect(isJumbo('😀😀😀😀')).toBe(false);
    expect(isJumbo('ok 😀')).toBe(false);
    expect(isJumbo('')).toBe(false);
  });
});

describe('online sources', () => {
  it('reads Giphy stickers as WebP and GIFs as GIF', () => {
    const json = { data: [{ id: 'a1', title: 'Wave', images: { fixed_height: { webp: 'https://m/h.webp', url: 'https://m/h.gif' }, fixed_width_small: { webp: 'https://m/s.webp', url: 'https://m/s.gif' }, downsized_medium: { url: 'https://m/d.gif' } } }, { id: 'bad' }] };
    expect(parse.giphy(json, 'sticker')).toEqual([{ id: 'a1', preview: 'https://m/s.webp', send: 'https://m/h.webp', ext: 'webp', title: 'Wave' }]);
    expect(parse.giphy(json, 'gif')[0]).toMatchObject({ send: 'https://m/d.gif', ext: 'gif' });
    expect(parse.giphy({}, 'gif')).toEqual([]);
  });
  it('keeps only animated GIFs from Imgur, once each, over https and under the size limit', () => {
    const json = { data: [{ id: 'p', link: 'http://i.imgur.com/p.gif', type: 'image/gif', size: 100 }, { id: 'p', link: 'http://i.imgur.com/p.gif', type: 'image/gif' }, { id: 'big', link: 'https://i.imgur.com/b.gif', type: 'image/gif', size: 99_000_000 }, { id: 'png', link: 'https://i.imgur.com/c.png', type: 'image/png' }, { id: 'album', images: [{ id: 'in', link: 'https://i.imgur.com/in.gif', animated: true, type: 'image/gif' }] }] };
    expect(parse.imgur(json).map((i) => [i.id, i.send])).toEqual([['p', 'https://i.imgur.com/p.gif'], ['in', 'https://i.imgur.com/in.gif']]);
  });
  it('keeps only GIF files from Wikimedia, by title', () => {
    const json = { query: { pages: { 1: { pageid: 1, title: 'File:Zebra.gif', imageinfo: [{ url: 'https://u/z.gif', thumburl: 'https://u/zt.gif', mime: 'image/gif', size: 10 }] }, 2: { pageid: 2, title: 'File:Ant.gif', imageinfo: [{ url: 'https://u/a.gif', mime: 'image/gif', size: 10 }] }, 3: { pageid: 3, title: 'File:x.png', imageinfo: [{ url: 'https://u/x.png', mime: 'image/png', size: 10 }] } } } };
    expect(parse.commons(json).map((i) => i.title)).toEqual(['Ant', 'Zebra']);
  });
  it('reads reaction GIFs and the animated emoji list', () => {
    expect(parse.nekos({ results: [{ url: 'https://n/hug/abc.gif', anime_name: 'Show' }] }, 'hug')[0]).toMatchObject({ id: 'abc', title: 'hug · Show' });
    expect(parse.animatedEmoji('1f600\tgrinning face\n\n2764_fe0f\tred heart\r\n')).toEqual([['1f600', 'grinning face'], ['2764_fe0f', 'red heart']]);
    expect(parse.glyph('2764_fe0f')).toBe('❤️');
  });
});

import { at, snippet } from './search';

describe('message search helpers', () => {
  it('finds text in any case', () => {
    expect(at('Nine works. There is a Bakery', 'bakery')).toBe(23);
    expect(at('abc', 'x')).toBe(-1);
  });
  it('cuts a short piece around the match', () => {
    const s = snippet('a'.repeat(120) + ' bakery ' + 'b'.repeat(120), 'bakery');
    expect(s.match).toBe('bakery');
    expect(s.before.startsWith('…')).toBe(true);
    expect(s.after.endsWith('…')).toBe(true);
    expect(s.before.length + s.match.length + s.after.length).toBeLessThan(100);
  });
  it('shows the start of the text when nothing matches', () => {
    expect(snippet('hello there', 'zzz')).toEqual({ before: 'hello there', match: '', after: '' });
  });
});
