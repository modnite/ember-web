// How Ember looks: light, dark or black, an accent colour, and the chat wallpaper. The rules follow the Android app (ui/theme/Theme.kt and
// ui/chat/Wallpaper.kt): a whole colour scheme grown from one accent, and Black as the dark scheme on pure black for OLED screens.

import { BIG_DOODLES, FILL_DOODLES } from './doodleShapes';
import { loadPhoto } from './wallpaper';

export type ThemeMode = 'system' | 'light' | 'dark' | 'black';
/** What lies under the doodles: the chat's own colour (the theme's and the accent's), a stronger wash of the accent, or a photo. */
export type WallpaperChoice = 'default' | 'accent' | 'photo';

/** Ember's own orange plus a handful of others. A custom colour can be typed in as well. */
export const ACCENTS: Array<{ name: string; hex: string | null }> = [
  { name: 'Ember', hex: null },
  { name: 'Blue', hex: '#2f6fed' },
  { name: 'Teal', hex: '#0f9d8a' },
  { name: 'Green', hex: '#2e9e4f' },
  { name: 'Yellow', hex: '#e0a100' },
  { name: 'Red', hex: '#d93025' },
  { name: 'Pink', hex: '#d6336c' },
  { name: 'Purple', hex: '#7048e8' },
  { name: 'Graphite', hex: '#607d8b' },
];

export const WALLPAPERS: Array<{ id: WallpaperChoice; label: string }> = [
  { id: 'default', label: 'Default' },
  { id: 'accent', label: 'Accent colour' },
];

/** "#rgb" or "#rrggbb" (the # is optional) as a lower case "#rrggbb", or null when it is not a colour. */
export function parseHex(text: string): string | null {
  let t = text.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(t)) t = t.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/.test(t) ? `#${t}` : null;
}

export const accentName = (hex: string): string => ACCENTS.find((a) => a.hex === hex)?.name ?? 'Custom';

function toHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const clamp = (v: number): number => Math.min(1, Math.max(0, v));
/** CSS colour from hue (degrees), saturation and lightness (0 to 1). */
const hsl = (h: number, s: number, l: number): string => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(clamp(s) * 100)}% ${Math.round(clamp(l) * 100)}%)`;

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Text on top of a colour: dark on light colours, white on dark ones. */
export const onColor = (hex: string): string => (luminance(hex) > 0.45 ? '#1b1411' : '#ffffff');

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** The colour variables a whole scheme grown from one accent needs. Everything else stays as the stylesheet has it. */
export function accentVars(accent: string, dark: boolean): Record<string, string> {
  const [h, sat] = toHsl(accent);
  if (!dark) {
    return {
      '--primary': accent, '--on-primary': onColor(accent),
      '--primary-container': hsl(h, 0.85, 0.9), '--on-primary-container': hsl(h, 0.9, 0.14),
      '--bg': hsl(h, 0.3, 0.975), '--on-bg': hsl(h, 0.2, 0.1),
      '--surface-variant': hsl(h, 0.25, 0.9), '--on-surface-variant': hsl(h, 0.15, 0.3),
      '--container': hsl(h, 0.28, 0.94), '--container-high': hsl(h, 0.27, 0.92), '--container-highest': hsl(h, 0.26, 0.89),
      '--outline': hsl(h, 0.1, 0.48), '--outline-variant': hsl(h, 0.2, 0.82),
      '--bubble-mine': hsl(h, 0.85, 0.89), '--on-bubble-mine': hsl(h, 0.6, 0.1), '--bubble-theirs': '#ffffff', '--on-bubble-theirs': hsl(h, 0.2, 0.1),
      '--chat-bg': hsl(h, 0.3, 0.95),
    };
  }
  const s = Math.max(sat, 0.35);
  const primary = hslToHex(h, Math.min(s, 0.95), 0.68);
  return {
    '--primary': primary, '--on-primary': onColor(primary),
    '--primary-container': hsl(h, 0.6, 0.26), '--on-primary-container': hsl(h, 0.9, 0.9),
    '--bg': hsl(h, 0.16, 0.07), '--on-bg': hsl(h, 0.1, 0.9),
    '--surface-variant': hsl(h, 0.12, 0.22), '--on-surface-variant': hsl(h, 0.12, 0.78),
    '--container': hsl(h, 0.16, 0.11), '--container-high': hsl(h, 0.15, 0.14), '--container-highest': hsl(h, 0.14, 0.18),
    '--outline': hsl(h, 0.08, 0.58), '--outline-variant': hsl(h, 0.1, 0.26),
    '--bubble-mine': hsl(h, 0.55, 0.22), '--on-bubble-mine': hsl(h, 0.9, 0.93), '--bubble-theirs': hsl(h, 0.14, 0.15), '--on-bubble-theirs': hsl(h, 0.1, 0.9),
    '--chat-bg': hsl(h, 0.16, 0.06), '--call-bg': hsl(h, 0.16, 0.04),
  };
}

/** The dark scheme on pure black, as on an OLED screen. */
export const BLACK_VARS: Record<string, string> = {
  '--bg': '#000000', '--container': '#0c0c0c', '--container-high': '#151515', '--container-highest': '#1e1e1e', '--surface-variant': '#242424',
  '--chat-bg': '#000000', '--call-bg': '#000000', '--bubble-theirs': '#1a1a1a',
};

const enc = (svg: string): string => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

const BIG_CELL = 70;
const BIG_ROW = 63;
const FILL_CELL = 17.5;

/** A number from 0 up to 1 that is always the same for the same row, column and purpose (the Android app computes the identical one). */
export function doodleUnit(row: number, col: number, salt: number): number {
  let h = (Math.imul(row, 374761393) + Math.imul(col, 668265263) + Math.imul(salt, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h & 0x7fffffff) % 10000) / 10000;
}

export interface Placed {
  x: number;
  y: number;
  r: number;
  turn: number;
  kind: number;
  fade: number;
}

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/**
 * Where the large icons go. Rows are staggered, then every icon is moved a good way off its spot and pushed clear of the ones already placed,
 * so nothing lines up. The kind is chosen at random from those not used near it, so one icon never turns up close to itself. With `wrap` the
 * picture joins up with itself at the edges (a tile). Rows and columns must both be even then.
 */
export function layoutBig(rows: number, cols: number, wrap: boolean, kinds: number): Placed[] {
  const placed: Array<Placed | null> = new Array<Placed | null>(rows * cols).fill(null);
  const w = cols * BIG_CELL;
  const h = rows * BIG_ROW;
  const near = (r: number, c: number): { p: Placed; dx: number; dy: number } | null => {
    let rr = r;
    let cc = c;
    let dx = 0;
    let dy = 0;
    if (wrap) {
      rr = mod(r, rows);
      cc = mod(c, cols);
      dx = Math.floor(c / cols) * w;
      dy = Math.floor(r / rows) * h;
    } else if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
    const p = placed[rr * cols + cc];
    return p ? { p, dx, dy } : null;
  };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let x = (col + 0.5 + 0.5 * (row & 1)) * BIG_CELL + (doodleUnit(row, col, 2) - 0.5) * 0.5 * BIG_CELL;
      let y = (row + 0.5) * BIG_ROW + (doodleUnit(row, col, 3) - 0.5) * 0.5 * BIG_ROW;
      const r = 12 + 4 * doodleUnit(row, col, 4);
      const used = new Set<number>();
      for (let dr = -3; dr <= 3; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
          const n = near(row + dr, col + dc);
          if (!n) continue;
          used.add(n.p.kind);
          if (Math.abs(dr) > 2 || Math.abs(dc) > 2) continue;
          const nx = n.p.x + n.dx;
          const ny = n.p.y + n.dy;
          const d = Math.hypot(x - nx, y - ny);
          const least = r + n.p.r + 5;
          if (d < least) {
            const a = doodleUnit(row, col, 9) * Math.PI * 2;
            const ux = d < 0.01 ? Math.cos(a) : (x - nx) / d;
            const uy = d < 0.01 ? Math.sin(a) : (y - ny) / d;
            x += ux * (least - d);
            y += uy * (least - d);
          }
        }
      }
      const free: number[] = [];
      for (let k = 0; k < kinds; k++) if (!used.has(k)) free.push(k);
      const pool = free.length ? free : Array.from({ length: kinds }, (_, k) => k);
      placed[row * cols + col] = {
        x, y, r,
        turn: (doodleUnit(row, col, 5) - 0.5) * 70,
        kind: pool[Math.min(pool.length - 1, Math.floor(doodleUnit(row, col, 6) * pool.length))]!,
        fade: 0.8 + 0.2 * doodleUnit(row, col, 7),
      };
    }
  }
  return placed as Placed[];
}

/** The small shape of a place (most are dots), or null when a large icon is too close. `bigs` are the large icons in range of it. */
export function fillDoodle(row: number, col: number, bigs: Placed[], kinds: number): Placed | null {
  const x = (col + 0.5) * FILL_CELL + (doodleUnit(row, col, 12) - 0.5) * 0.8 * FILL_CELL;
  const y = (row + 0.5) * FILL_CELL + (doodleUnit(row, col, 13) - 0.5) * 0.8 * FILL_CELL;
  const r = 2.5 + 3 * doodleUnit(row, col, 14);
  for (const b of bigs) if (Math.hypot(x - b.x, y - b.y) < b.r * 1.3 + r + 2) return null;
  const pick = doodleUnit(row, col, 16);
  const kind = pick < 0.35 ? 0 : 1 + Math.min(kinds - 2, Math.floor(doodleUnit(row, col, 17) * (kinds - 1)));
  return { x, y, r, turn: doodleUnit(row, col, 15) * 360, kind, fade: 0.7 + 0.3 * doodleUnit(row, col, 18) };
}

/**
 * The doodles as a tile: large outline icons with small dots, rings and sparkles filling every gap between them, the way the big messengers
 * draw their backgrounds. Each shape is written once and used where it is placed. The tile is larger than a chat window, so the picture does not
 * visibly repeat, and it joins up with itself at the edges when a screen is larger still.
 */
export function doodleTile(accent: string, dark: boolean): string {
  const bigCols = 22;
  const bigRows = 20;
  const w = BIG_CELL * bigCols;
  const h = BIG_ROW * bigRows;
  const base = dark ? 0.26 : 0.22;
  const bigs = layoutBig(bigRows, bigCols, true, BIG_DOODLES.length);
  // Every large icon (and its copies one tile away) by place, so a small shape only looks at the ones near it.
  const bucket = new Map<string, Placed[]>();
  const key = (x: number, y: number): string => `${Math.floor(x / BIG_CELL)},${Math.floor(y / BIG_ROW)}`;
  for (const b of bigs) {
    for (const dx of [0, -w, w]) {
      for (const dy of [0, -h, h]) {
        const q = { ...b, x: b.x + dx, y: b.y + dy };
        if (q.x < -BIG_CELL * 2 || q.x > w + BIG_CELL * 2 || q.y < -BIG_ROW * 2 || q.y > h + BIG_ROW * 2) continue;
        const k = key(q.x, q.y);
        const list = bucket.get(k);
        if (list) list.push(q);
        else bucket.set(k, [q]);
      }
    }
  }
  const nearBigs = (x: number, y: number): Placed[] => {
    const out: Placed[] = [];
    const cx = Math.floor(x / BIG_CELL);
    const cy = Math.floor(y / BIG_ROW);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(bucket.get(`${cx + i},${cy + j}`) ?? []));
    return out;
  };
  const defs = [...BIG_DOODLES.map((d, i) => `<path id="b${i}" d="${d}" vector-effect="non-scaling-stroke"/>`), ...FILL_DOODLES.map((d, i) => `<path id="f${i}" d="${d}" vector-effect="non-scaling-stroke"/>`)].join('');
  // Shapes are grouped by how faint they are, so the line width and opacity are written once per group instead of once per shape.
  const groups = new Map<string, string>();
  const put = (id: string, p: Placed, width: number): void => {
    for (const dx of [0, -w, w]) {
      for (const dy of [0, -h, h]) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (x < -p.r * 1.5 || x > w + p.r * 1.5 || y < -p.r * 1.5 || y > h + p.r * 1.5) continue;
        const g = `${width}/${(Math.round(p.fade * 5) / 5).toFixed(1)}`;
        groups.set(g, (groups.get(g) ?? '') + `<use href="#${id}" transform="translate(${Math.round(x)} ${Math.round(y)}) rotate(${Math.round(p.turn)}) scale(${p.r.toFixed(1)})"/>`);
      }
    }
  };
  for (const b of bigs) put(`b${b.kind}`, b, 1.9);
  for (let row = 0; row < h / FILL_CELL; row++) {
    for (let col = 0; col < w / FILL_CELL; col++) {
      const x = (col + 0.5) * FILL_CELL;
      const y = (row + 0.5) * FILL_CELL;
      const p = fillDoodle(row, col, nearBigs(x, y), FILL_DOODLES.length);
      if (p) put(`f${p.kind}`, p, 1.5);
    }
  }
  const body = [...groups.entries()].map(([g, uses]) => {
    const [width, fade] = g.split('/');
    return `<g stroke-width="${width}" stroke-opacity="${(base * Number(fade)).toFixed(3)}">${uses}</g>`;
  }).join('');
  return enc(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" stroke="${accent}" stroke-linecap="round" stroke-linejoin="round"><defs>${defs}</defs>${body}</svg>`);
}

/** The flat colour of a wallpaper: the chat's own colour, or a wash of the accent that follows the theme (light, dark or black). */
export function washColor(choice: WallpaperChoice, accent: string | null, dark: boolean, black: boolean): string {
  if (choice !== 'accent') return 'var(--chat-bg)';
  const h = accent ? toHsl(accent)[0] : 21;
  if (!dark) return hsl(h, 0.55, 0.86);
  return black ? hsl(h, 0.35, 0.1) : hsl(h, 0.4, 0.17);
}

/**
 * The CSS of a wallpaper, from the top layer down: the dimming, then the doodles, then a photo, over the flat colour. The doodles take the accent
 * colour. Dimming (0 to 70 percent) darkens everything under it.
 */
export function wallpaperCss(choice: WallpaperChoice, accent: string, dark: boolean, photoUrl: string | null, dim: number, doodles: boolean): { image: string; size: string } {
  const layers: Array<[string, string]> = [];
  const d = Math.min(70, Math.max(0, dim)) / 100;
  if (d > 0) layers.push([`linear-gradient(rgba(0,0,0,${d}), rgba(0,0,0,${d}))`, 'auto']);
  const photo = choice === 'photo' && photoUrl;
  if (doodles && !photo) layers.push([doodleTile(accent, dark), `${BIG_CELL * 22}px ${BIG_ROW * 20}px`]);
  if (photo) layers.push([`url("${photoUrl}")`, 'cover']);
  if (!layers.length) return { image: 'none', size: 'auto' };
  return { image: layers.map((l) => l[0]).join(', '), size: layers.map((l) => l[1]).join(', ') };
}

export interface Look {
  theme: ThemeMode;
  /** "#rrggbb", or '' for Ember's own orange. */
  accent: string;
  wallpaper: WallpaperChoice;
  /** The doodles over a flat colour (not over a photo). */
  doodles: boolean;
  wallpaperDim: number;
}

const OWN: string[] = [];

/** Put the look on the page: the colour scheme, the accent, the wallpaper, and the colour of the browser bar. */
export async function applyLook(look: Look): Promise<void> {
  const root = document.documentElement;
  const dark = look.theme === 'dark' || look.theme === 'black' || (look.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.black = look.theme === 'black' ? '1' : '';
  for (const k of OWN) root.style.removeProperty(k);
  OWN.length = 0;
  const set = (vars: Record<string, string>): void => {
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v);
      OWN.push(k);
    }
  };
  const accent = parseHex(look.accent);
  if (accent) set(accentVars(accent, dark));
  if (dark && look.theme === 'black') set(BLACK_VARS);
  const ink = accent ? (dark ? hslToHex(toHsl(accent)[0], Math.min(Math.max(toHsl(accent)[1], 0.35), 0.95), 0.68) : accent) : dark ? '#ff8a55' : '#e8590c';
  const photo = look.wallpaper === 'photo' ? await loadPhoto() : null;
  const w = wallpaperCss(photo ? look.wallpaper : look.wallpaper === 'photo' ? 'default' : look.wallpaper, ink, dark, photo, look.wallpaperDim, look.doodles);
  set({ '--wall-image': w.image, '--wall-size': w.size, '--wall-color': washColor(look.wallpaper === 'photo' ? 'default' : look.wallpaper, accent, dark, look.theme === 'black') });
  const bar = getComputedStyle(root).getPropertyValue('--bg').trim() || (dark ? '#16110e' : '#fffbf8');
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', look.theme === 'black' && dark ? '#000000' : bar);
}
