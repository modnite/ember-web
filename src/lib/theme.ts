// How Ember looks: light, dark or black, an accent colour, and the chat wallpaper. The rules follow the Android app (ui/theme/Theme.kt and
// ui/chat/Wallpaper.kt): a whole colour scheme grown from one accent, and Black as the dark scheme on pure black for OLED screens.

import { BIG_DOODLES, FILL_DOODLES } from './doodleShapes';
import { loadPhoto } from './wallpaper';

export type ThemeMode = 'system' | 'light' | 'dark' | 'black';
export type WallpaperChoice = 'doodle' | 'gradient' | 'dots' | 'plain' | 'photo';

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
  { id: 'doodle', label: 'Doodles' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'dots', label: 'Dots' },
  { id: 'plain', label: 'Plain' },
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

const BIG_CELL = 66;
const FILL_CELL = 16.5;

/** A number from 0 up to 1 that is always the same for the same row, column and purpose (the Android app computes the identical one). */
export function doodleUnit(row: number, col: number, salt: number): number {
  let h = (Math.imul(row, 374761393) + Math.imul(col, 668265263) + Math.imul(salt, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h & 0x7fffffff) % 10000) / 10000;
}

interface Placed {
  x: number;
  y: number;
  r: number;
  turn: number;
  kind: number;
  fade: number;
}

/** The large icon of a place: a little off its spot, a little different in size, tipped a little either way. */
export function bigDoodle(row: number, col: number): Placed {
  return {
    x: (col + 0.5) * BIG_CELL + (doodleUnit(row, col, 2) - 0.5) * 0.36 * BIG_CELL,
    y: (row + 0.5) * BIG_CELL + (doodleUnit(row, col, 3) - 0.5) * 0.36 * BIG_CELL,
    r: 12 + 5 * doodleUnit(row, col, 4),
    turn: (doodleUnit(row, col, 5) - 0.5) * 70,
    kind: Math.min(BIG_DOODLES.length - 1, Math.floor(doodleUnit(row, col, 6) * BIG_DOODLES.length)),
    fade: 0.8 + 0.2 * doodleUnit(row, col, 7),
  };
}

/** The small shape of a place (most are dots), or null when a large icon is too close. `big` finds the large icon of a place, so a tile can wrap. */
export function fillDoodle(row: number, col: number, big: (row: number, col: number) => Placed = bigDoodle): Placed | null {
  const x = (col + 0.5) * FILL_CELL + (doodleUnit(row, col, 12) - 0.5) * 0.7 * FILL_CELL;
  const y = (row + 0.5) * FILL_CELL + (doodleUnit(row, col, 13) - 0.5) * 0.7 * FILL_CELL;
  const r = 2.5 + 3 * doodleUnit(row, col, 14);
  const bigRow = Math.floor(y / BIG_CELL);
  const bigCol = Math.floor(x / BIG_CELL);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const b = big(bigRow + dr, bigCol + dc);
      if (Math.hypot(x - b.x, y - b.y) < b.r * 1.3 + r + 2) return null;
    }
  }
  const pick = doodleUnit(row, col, 16);
  const kind = pick < 0.4 ? 0 : 1 + Math.min(FILL_DOODLES.length - 2, Math.floor(doodleUnit(row, col, 17) * (FILL_DOODLES.length - 1)));
  return { x, y, r, turn: doodleUnit(row, col, 15) * 360, kind, fade: 0.7 + 0.3 * doodleUnit(row, col, 18) };
}

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/**
 * The doodles as a tile that repeats: larger outline icons with small dots, rings and sparkles filling every gap between them, the way the big
 * messengers draw their backgrounds. Each shape is written once and used where it is placed. A shape that crosses the edge of the tile is drawn
 * again on the far side, so the tile joins up with itself.
 */
export function doodleTile(accent: string, dark: boolean): string {
  const bigCols = 12;
  const bigRows = 10;
  const w = BIG_CELL * bigCols;
  const h = BIG_CELL * bigRows;
  const base = dark ? 0.26 : 0.22;
  // The large icon of any place, wrapped so the picture repeats exactly at the tile's edges.
  const wrapped = (row: number, col: number): Placed => {
    const rr = mod(row, bigRows);
    const cc = mod(col, bigCols);
    const b = bigDoodle(rr, cc);
    return { ...b, x: b.x + ((col - cc) / bigCols) * w, y: b.y + ((row - rr) / bigRows) * h };
  };
  const defs = [...BIG_DOODLES.map((d, i) => `<path id="b${i}" d="${d}" vector-effect="non-scaling-stroke"/>`), ...FILL_DOODLES.map((d, i) => `<path id="f${i}" d="${d}" vector-effect="non-scaling-stroke"/>`)].join('');
  let uses = '';
  const put = (id: string, p: Placed, width: number): void => {
    for (const dx of [0, -w, w]) {
      for (const dy of [0, -h, h]) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (x < -p.r * 1.5 || x > w + p.r * 1.5 || y < -p.r * 1.5 || y > h + p.r * 1.5) continue;
        uses += `<use href="#${id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${p.turn.toFixed(0)}) scale(${p.r.toFixed(1)})" stroke-width="${width}" stroke-opacity="${(base * p.fade).toFixed(3)}"/>`;
      }
    }
  };
  for (let row = 0; row < bigRows; row++) for (let col = 0; col < bigCols; col++) put(`b${bigDoodle(row, col).kind}`, bigDoodle(row, col), 1.9);
  for (let row = 0; row < h / FILL_CELL; row++) {
    for (let col = 0; col < w / FILL_CELL; col++) {
      const p = fillDoodle(row, col, wrapped);
      if (p) put(`f${p.kind}`, p, 1.5);
    }
  }
  return enc(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" stroke="${accent}" stroke-linecap="round" stroke-linejoin="round"><defs>${defs}</defs>${uses}</svg>`);
}

function dotsTile(accent: string, dark: boolean): string {
  const gap = 22;
  const h = gap * 0.8 * 2;
  return enc(`<svg xmlns="http://www.w3.org/2000/svg" width="${gap * 2}" height="${h}" viewBox="0 0 ${gap * 2} ${h}" fill="${accent}" fill-opacity="${dark ? 0.22 : 0.2}"><circle cx="${gap / 2}" cy="${gap * 0.4}" r="1.6"/><circle cx="${gap * 1.5}" cy="${gap * 0.4}" r="1.6"/><circle cx="${gap}" cy="${gap * 1.2}" r="1.6"/><circle cx="0" cy="${gap * 1.2}" r="1.6"/><circle cx="${gap * 2}" cy="${gap * 1.2}" r="1.6"/></svg>`);
}

/** The CSS of a wallpaper: layers over the chat's own background colour. */
export function wallpaperCss(choice: WallpaperChoice, accent: string, dark: boolean, photoUrl: string | null, dim: number): { image: string; size: string } {
  switch (choice) {
    case 'photo':
      if (photoUrl) {
        const d = Math.min(70, Math.max(0, dim)) / 100;
        return { image: `${d > 0 ? `linear-gradient(rgba(0,0,0,${d}), rgba(0,0,0,${d})), ` : ''}url("${photoUrl}")`, size: 'cover' };
      }
      return wallpaperCss('doodle', accent, dark, null, 0);
    case 'plain':
      return { image: 'none', size: 'auto' };
    case 'gradient': {
      const a = hexA(accent, dark ? 0.3 : 0.26);
      const b = hexA(accent, dark ? 0.04 : 0.03);
      return { image: `linear-gradient(135deg, ${a}, ${b})`, size: 'cover' };
    }
    case 'dots':
      return { image: dotsTile(accent, dark), size: 'auto' };
    default:
      return { image: `${doodleTile(accent, dark)}, linear-gradient(${hexA(accent, dark ? 0.05 : 0.06)}, ${hexA(accent, dark ? 0.05 : 0.06)})`, size: 'auto' };
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export interface Look {
  theme: ThemeMode;
  /** "#rrggbb", or '' for Ember's own orange. */
  accent: string;
  wallpaper: WallpaperChoice;
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
  const w = wallpaperCss(look.wallpaper, ink, dark, photo, look.wallpaperDim);
  set({ '--wall-image': w.image, '--wall-size': w.size });
  const bar = getComputedStyle(root).getPropertyValue('--bg').trim() || (dark ? '#16110e' : '#fffbf8');
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', look.theme === 'black' && dark ? '#000000' : bar);
}
