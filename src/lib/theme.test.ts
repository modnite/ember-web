import { describe, expect, it } from 'vitest';
import { BIG_DOODLES, FILL_DOODLES } from './doodleShapes';
import { BLACK_VARS, accentName, accentVars, bigDoodle, doodleTile, doodleUnit, fillDoodle, onColor, parseHex, wallpaperCss } from './theme';

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
  it('has plenty of large icons and small fillers, written with only the commands both apps draw', () => {
    expect(BIG_DOODLES.length).toBeGreaterThanOrEqual(30);
    expect(FILL_DOODLES.length).toBeGreaterThanOrEqual(10);
    for (const d of [...BIG_DOODLES, ...FILL_DOODLES]) expect(d).toMatch(/^[MLHVCQZ0-9. \-]+$/);
  });
  it('draws each shape once and uses it where it is placed', () => {
    const svg = decodeURIComponent(doodleTile('#e8590c', false));
    expect(svg).toContain('<defs>');
    expect((svg.match(/<use /g) ?? []).length).toBeGreaterThan(1000);
    expect(svg).toContain('vector-effect="non-scaling-stroke"');
  });
  it('keeps the small shapes clear of the large icons, and fills the space between them', () => {
    let placed = 0;
    let skipped = 0;
    for (let row = 0; row < 40; row++) {
      for (let col = 0; col < 48; col++) {
        const p = fillDoodle(row, col);
        if (!p) { skipped++; continue; }
        placed++;
        const b = bigDoodle(Math.floor(p.y / 66), Math.floor(p.x / 66));
        expect(Math.hypot(p.x - b.x, p.y - b.y)).toBeGreaterThan(b.r);
      }
    }
    expect(placed).toBeGreaterThan(skipped);
  });
  it('never puts two large icons on top of each other', () => {
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 12; col++) {
        const a = bigDoodle(row, col);
        for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
          const b = bigDoodle(row + dr, col + dc);
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
        }
      }
    }
  });
  it('is jumbled but always the same: a fixed scatter, no two neighbours alike by position', () => {
    const again = decodeURIComponent(doodleTile('#e8590c', false));
    expect(again).toBe(decodeURIComponent(doodleTile('#e8590c', false)));
    const units = new Set(Array.from({ length: 200 }, (_, i) => doodleUnit(Math.floor(i / 20), i % 20, 2)));
    expect(units.size).toBeGreaterThan(150);
    for (const u of units) { expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThan(1); }
    expect(doodleUnit(3, 4, 5)).toBe(doodleUnit(3, 4, 5));
  });
  it('darkens a photo by the chosen amount, at most 70 percent, and falls back to doodles with no photo', () => {
    expect(wallpaperCss('photo', '#e8590c', false, 'blob:x', 25).image).toContain('rgba(0,0,0,0.25)');
    expect(wallpaperCss('photo', '#e8590c', false, 'blob:x', 200).image).toContain('rgba(0,0,0,0.7)');
    expect(wallpaperCss('photo', '#e8590c', false, null, 0).image).toContain('data:image/svg+xml');
  });
});
