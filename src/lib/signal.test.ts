import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extensionOf, fromHex, openSealed, packKeys, parseDirectory, parseManifest, searchPacks } from './signal';

// A real sealed manifest from Signal's CDN (the Scooby-Doo pack) and the key its directory lists for it.
const KEY = '1111b7791c629c620ad00d798681412cefad7b16e8dc355ed9ded428ab68bac2';
const sealed = new Uint8Array(readFileSync('tests/fixtures/signal-manifest.bin'));

describe('signal sticker packs', () => {
  it('derives two 32 byte keys from the pack key', async () => {
    const { aes, mac } = await packKeys(KEY);
    expect(aes).toHaveLength(32);
    expect(mac).toHaveLength(32);
    expect(Array.from(aes)).not.toEqual(Array.from(mac));
  });
  it('opens a real manifest and reads the pack', async () => {
    const m = parseManifest(await openSealed(KEY, sealed));
    expect(m.title.length).toBeGreaterThan(0);
    expect(m.stickers.length).toBeGreaterThan(3);
    expect(m.stickers.some((s) => s.id === m.cover)).toBe(true);
  });
  it('refuses a wrong key and a changed file', async () => {
    await expect(openSealed('00'.repeat(32), sealed)).rejects.toThrow(/does not match/);
    const bent = sealed.slice();
    bent[20] = bent[20]! ^ 1;
    await expect(openSealed(KEY, bent)).rejects.toThrow(/does not match/);
    await expect(openSealed(KEY, new Uint8Array(10))).rejects.toThrow(/Too short/);
  });
  it('reads the directory, leaving out packs marked not safe for work', () => {
    const yaml = [
      '# comment',
      `${'a'.repeat(32)}:`, `  key: ${'1'.repeat(64)}`, '  tags:', "    - 'Cat'", '    - Meme',
      `${'b'.repeat(32)}:`, `  key: ${'2'.repeat(64)}`, '  nsfw: true', '  tags:', '    - Cat',
      `${'c'.repeat(32)}:`, `  key: ${'3'.repeat(64)}`, '  tags:', '    - NSFW',
      `${'d'.repeat(32)}:`, '  key: short', '  tags:', '    - Cat',
    ].join('\n');
    const packs = parseDirectory(yaml);
    expect(packs.map((p) => p.id[0])).toEqual(['a']);
    expect(packs[0]!.tags).toEqual(['Cat', 'Meme']);
  });
  it('searches by tags, exact matches first, every word needed', () => {
    const packs = [
      { id: '1', key: 'k', tags: ['Catalog', 'Dog'] },
      { id: '2', key: 'k', tags: ['Cat', 'Dog'] },
      { id: '3', key: 'k', tags: ['Bird'] },
    ];
    expect(searchPacks(packs, 'cat').map((p) => p.id)).toEqual(['2', '1']);
    expect(searchPacks(packs, 'cat dog').map((p) => p.id)).toEqual(['2', '1']);
    expect(searchPacks(packs, 'cat bird')).toEqual([]);
    expect(searchPacks(packs, '').map((p) => p.id)).toEqual(['1', '2', '3']);
  });
  it('tells a WebP from a PNG by its first bytes', () => {
    const webp = Uint8Array.from([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0)), [0]));
    expect(extensionOf(webp)).toBe('webp');
    expect(extensionOf(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('png');
    expect(fromHex('0aff')).toEqual(Uint8Array.from([10, 255]));
  });
});
