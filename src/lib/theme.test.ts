import { describe, expect, it } from 'vitest';
import { BIG_DOODLES, FILL_DOODLES } from './doodleShapes';
import { BLACK_VARS, accentName, accentVars, doodleTile, doodleUnit, fillDoodle, layoutBig, onColor, parseHex, wallpaperCss, washColor } from './theme';

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

describe('the wallpaper: a flat colour, doodles you can switch off, and dimming', () => {
  it('is the chat colour by default, so it follows the theme and the accent', () => {
    expect(washColor('default', '#2f6fed', false, false)).toBe('var(--chat-bg)');
  });
  it('washes the accent over the colour when asked, lighter in light, darker in dark, darkest in black', () => {
    const light = washColor('accent', '#2f6fed', false, false);
    const dark = washColor('accent', '#2f6fed', true, false);
    const black = washColor('accent', '#2f6fed', true, true);
    expect(light).toMatch(/^hsl\(\d+ 55% 86%\)$/);
    expect(dark).toMatch(/^hsl\(\d+ 40% 17%\)$/);
    expect(black).toMatch(/^hsl\(\d+ 35% 10%\)$/);
    expect(light.split(' ')[0]).toBe(dark.split(' ')[0]);
  });
  it('draws nothing over the flat colour with the doodles off and no dimming', () => {
    expect(wallpaperCss('default', '#e8590c', false, null, 0, false).image).toBe('none');
  });
  it('draws the doodles in the accent colour when they are on', () => {
    const css = wallpaperCss('default', '#2f6fed', false, null, 0, true);
    expect(css.image).toContain('data:image/svg+xml');
    expect(decodeURIComponent(css.image)).toContain('stroke="#2f6fed"');
  });
  it('puts the dimming on top of everything, at most 70 percent', () => {
    expect(wallpaperCss('default', '#e8590c', false, null, 25, true).image.startsWith('linear-gradient(rgba(0,0,0,0.25)')).toBe(true);
    expect(wallpaperCss('default', '#e8590c', false, null, 200, false).image).toContain('rgba(0,0,0,0.7)');
  });
  it('shows a photo instead of doodles, with the dimming over it', () => {
    const css = wallpaperCss('photo', '#e8590c', false, 'blob:x', 30, true);
    expect(css.image).toContain('url("blob:x")');
    expect(css.image).not.toContain('data:image/svg+xml');
    expect(css.size).toContain('cover');
  });
  it('falls back to the doodles when there is no photo', () => {
    expect(wallpaperCss('photo', '#e8590c', false, null, 0, true).image).toContain('data:image/svg+xml');
  });
});

describe('the doodles', () => {
  it('have a big set of large icons and of small fillers, written with only the commands both apps draw', () => {
    expect(BIG_DOODLES.length).toBeGreaterThanOrEqual(80);
    expect(FILL_DOODLES.length).toBeGreaterThanOrEqual(25);
    for (const d of [...BIG_DOODLES, ...FILL_DOODLES]) expect(d).toMatch(/^[MLHVCQZ0-9. -]+$/);
  });
  it('are the same every time', () => {
    expect(doodleTile('#e8590c', false)).toBe(doodleTile('#e8590c', false));
    expect(doodleUnit(3, 4, 5)).toBe(doodleUnit(3, 4, 5));
    const units = new Set(Array.from({ length: 200 }, (_, i) => doodleUnit(Math.floor(i / 20), i % 20, 2)));
    expect(units.size).toBeGreaterThan(150);
  });
  it('write each shape once and use it where it is placed', () => {
    const svg = decodeURIComponent(doodleTile('#e8590c', false));
    expect(svg).toContain('<defs>');
    expect((svg.match(/<use /g) ?? []).length).toBeGreaterThan(2000);
    expect(svg).toContain('vector-effect="non-scaling-stroke"');
  });
  it('never put two large icons on top of each other, also across the edge of the tile', () => {
    const rows = 20;
    const cols = 22;
    const bigs = layoutBig(rows, cols, true, BIG_DOODLES.length);
    const w = cols * 70;
    const h = rows * 63;
    for (let i = 0; i < bigs.length; i++) {
      for (let j = i + 1; j < bigs.length; j++) {
        for (const dx of [0, -w, w]) {
          for (const dy of [0, -h, h]) {
            const d = Math.hypot(bigs[i]!.x - bigs[j]!.x - dx, bigs[i]!.y - bigs[j]!.y - dy);
            if (d < 60) expect(d).toBeGreaterThanOrEqual(bigs[i]!.r + bigs[j]!.r);
          }
        }
      }
    }
  });
  it('do not put the same large icon near itself', () => {
    const rows = 20;
    const cols = 22;
    const bigs = layoutBig(rows, cols, true, BIG_DOODLES.length);
    let close = 0;
    for (let i = 0; i < bigs.length; i++) {
      for (let j = i + 1; j < bigs.length; j++) {
        if (bigs[i]!.kind !== bigs[j]!.kind) continue;
        const d = Math.hypot(bigs[i]!.x - bigs[j]!.x, bigs[i]!.y - bigs[j]!.y);
        if (d < 150) close++;
      }
    }
    expect(close).toBe(0);
  });
  it('use many different large icons, not a few', () => {
    const kinds = new Set(layoutBig(20, 22, true, BIG_DOODLES.length).map((b) => b.kind));
    expect(kinds.size).toBeGreaterThan(BIG_DOODLES.length * 0.8);
  });
  it('keep the small shapes clear of the large icons', () => {
    const bigs = layoutBig(20, 22, true, BIG_DOODLES.length);
    let placed = 0;
    let skipped = 0;
    for (let row = 0; row < 40; row++) {
      for (let col = 0; col < 48; col++) {
        const x = (col + 0.5) * 17.5;
        const y = (row + 0.5) * 17.5;
        const near = bigs.filter((b) => Math.hypot(b.x - x, b.y - y) < 60);
        const p = fillDoodle(row, col, near, FILL_DOODLES.length);
        if (!p) { skipped++; continue; }
        placed++;
        for (const b of near) expect(Math.hypot(p.x - b.x, p.y - b.y)).toBeGreaterThan(b.r);
      }
    }
    expect(placed).toBeGreaterThan(skipped);
  });
});
