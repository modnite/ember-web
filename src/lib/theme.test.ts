import { describe, expect, it } from 'vitest';
import { BLACK_VARS, accentName, accentVars, doodleTile, onColor, parseHex, wallpaperCss } from './theme';

describe('colours', () => {
  it('reads hex colours the way a person types them', () => {
    expect(parseHex('#2F6FED')).toBe('#2f6fed');
    expect(parseHex('2f6fed')).toBe('#2f6fed');
    expect(parseHex('#f80')).toBe('#ff8800');
    expect(parseHex('blue')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
  });
  it('puts dark text on light colours and white on dark ones', () => {
    expect(onColor('#ffe08a')).toBe('#1b1411');
    expect(onColor('#2f6fed')).toBe('#ffffff');
  });
  it('names the presets and calls anything else custom', () => {
    expect(accentName('#2f6fed')).toBe('Blue');
    expect(accentName('#123456')).toBe('Custom');
  });
});

describe('accent schemes', () => {
  it('uses the accent itself as the primary colour in light', () => {
    const v = accentVars('#2f6fed', false);
    expect(v['--primary']).toBe('#2f6fed');
    expect(v['--on-primary']).toBe('#ffffff');
    expect(v['--bubble-theirs']).toBe('#ffffff');
  });
  it('makes a lighter primary and dark surfaces in dark', () => {
    const v = accentVars('#2f6fed', true);
    expect(v['--primary']).not.toBe('#2f6fed');
    expect(v['--bg']).toMatch(/^hsl\(\d+ 16% 7%\)$/);
    expect(v['--call-bg']).toBeDefined();
  });
  it('gives pure black for OLED screens', () => {
    expect(BLACK_VARS['--bg']).toBe('#000000');
    expect(BLACK_VARS['--chat-bg']).toBe('#000000');
  });
});

describe('wallpapers', () => {
  it('draws plain as nothing and gradient and dots from the accent', () => {
    expect(wallpaperCss('plain', '#e8590c', false, null, 0).image).toBe('none');
    expect(wallpaperCss('gradient', '#e8590c', false, null, 0).image).toContain('linear-gradient(135deg, rgba(232, 89, 12, 0.26)');
    expect(wallpaperCss('dots', '#e8590c', true, null, 0).image).toContain('data:image/svg+xml');
  });
  it('keeps the doodle tile in the accent colour', () => {
    expect(decodeURIComponent(doodleTile('#2f6fed', false))).toContain('stroke="#2f6fed"');
  });
  it('darkens a photo by the chosen amount, at most 70 percent, and falls back to doodles with no photo', () => {
    expect(wallpaperCss('photo', '#e8590c', false, 'blob:x', 25).image).toContain('rgba(0,0,0,0.25)');
    expect(wallpaperCss('photo', '#e8590c', false, 'blob:x', 200).image).toContain('rgba(0,0,0,0.7)');
    expect(wallpaperCss('photo', '#e8590c', false, null, 0).image).toContain('data:image/svg+xml');
  });
});
