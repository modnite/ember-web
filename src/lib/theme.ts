// How Ember looks: light, dark or black, an accent colour, and the chat wallpaper. The rules follow the Android app (ui/theme/Theme.kt and
// ui/chat/Wallpaper.kt): a whole colour scheme grown from one accent, and Black as the dark scheme on pure black for OLED screens.

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

/** How many different little shapes the wallpaper scatters (the same sixteen as the Android app). */
export const DOODLE_KINDS = 16;

/** One small outline, turned a little: the shapes the Android wallpaper scatters. */
export function doodle(kind: number, x: number, y: number, r: number, turn: number): string {
  const at = `transform="rotate(${turn} ${x} ${y})"`;
  switch (kind) {
    case 0: return `<circle cx="${x}" cy="${y}" r="${r}" ${at}/>`;
    case 1: return `<path d="M${x - r} ${y}H${x + r}M${x} ${y - r}V${y + r}" ${at}/>`;
    case 2: return `<path d="M${x} ${y - r}L${x + r} ${y + r * 0.8}L${x - r} ${y + r * 0.8}Z" ${at}/>`;
    case 3: return `<path d="M${x - r * 1.2} ${y}Q${x - r * 0.6} ${y - r} ${x} ${y}Q${x + r * 0.6} ${y + r} ${x + r * 1.2} ${y}" ${at}/>`;
    case 4: return `<path d="M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z" ${at}/>`;
    case 5: return `<path d="M${x} ${y + r * 0.9}C${x - r * 1.9} ${y - r * 0.2} ${x - r * 0.9} ${y - r * 1.5} ${x} ${y - r * 0.4}C${x + r * 0.9} ${y - r * 1.5} ${x + r * 1.9} ${y - r * 0.2} ${x} ${y + r * 0.9}Z" ${at}/>`;
    case 6: return `<rect x="${x - r}" y="${y - r * 0.7}" width="${r * 2}" height="${r * 1.4}" rx="${r * 0.4}" ${at}/>`;
    // A star.
    case 7: {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = ((-90 + i * 36) * Math.PI) / 180;
        const rad = i % 2 === 0 ? r * 1.15 : r * 0.5;
        return `${(x + rad * Math.cos(a)).toFixed(2)} ${(y + rad * Math.sin(a)).toFixed(2)}`;
      });
      return `<path d="M${pts.join('L')}Z" ${at}/>`;
    }
    // A lightning bolt: one open stroke, so nothing crosses itself.
    case 8: return `<path d="M${x + r * 0.35} ${y - r * 1.2}L${x - r * 0.55} ${y + r * 0.15}L${x + r * 0.15} ${y + r * 0.15}L${x - r * 0.35} ${y + r * 1.2}" ${at}/>`;
    // A four pointed sparkle.
    case 9: return `<path d="M${x} ${y - r * 1.2}Q${x + r * 0.15} ${y - r * 0.15} ${x + r * 1.2} ${y}Q${x + r * 0.15} ${y + r * 0.15} ${x} ${y + r * 1.2}Q${x - r * 0.15} ${y + r * 0.15} ${x - r * 1.2} ${y}Q${x - r * 0.15} ${y - r * 0.15} ${x} ${y - r * 1.2}Z" ${at}/>`;
    // A zigzag.
    case 10: return `<path d="M${x - r * 1.3} ${y + r * 0.5}L${x - r * 0.65} ${y - r * 0.5}L${x} ${y + r * 0.5}L${x + r * 0.65} ${y - r * 0.5}L${x + r * 1.3} ${y + r * 0.5}" ${at}/>`;
    // A music note.
    case 11: return `<g ${at}><ellipse cx="${x - r * 0.4}" cy="${y + r * 0.8}" rx="${r * 0.55}" ry="${r * 0.4}"/><path d="M${x + r * 0.15} ${y + r * 0.8}V${y - r * 1.1}M${x + r * 0.15} ${y - r * 1.1}Q${x + r} ${y - r * 0.8} ${x + r * 0.9} ${y - r * 0.1}"/></g>`;
    // A drop.
    case 12: return `<path d="M${x} ${y - r * 1.2}C${x + r * 0.9} ${y - r * 0.1} ${x + r * 0.8} ${y + r} ${x} ${y + r}C${x - r * 0.8} ${y + r} ${x - r * 0.9} ${y - r * 0.1} ${x} ${y - r * 1.2}Z" ${at}/>`;
    // A crescent moon.
    case 13: return `<path d="M${x + r * 0.2} ${y - r * 1.1}C${x - r * 1.4} ${y - r * 1.1} ${x - r * 1.4} ${y + r * 1.1} ${x + r * 0.2} ${y + r * 1.1}C${x - r * 0.7} ${y + r * 0.7} ${x - r * 0.7} ${y - r * 0.7} ${x + r * 0.2} ${y - r * 1.1}Z" ${at}/>`;
    // A speech bubble, tail included, in one outline.
    case 14: return `<path d="M${x - r * 0.7} ${y - r * 0.8}H${x + r * 0.7}Q${x + r * 1.1} ${y - r * 0.8} ${x + r * 1.1} ${y - r * 0.4}V${y + r * 0.1}Q${x + r * 1.1} ${y + r * 0.5} ${x + r * 0.7} ${y + r * 0.5}H${x - r * 0.05}L${x - r * 0.7} ${y + r * 1.1}L${x - r * 0.55} ${y + r * 0.5}H${x - r * 0.7}Q${x - r * 1.1} ${y + r * 0.5} ${x - r * 1.1} ${y + r * 0.1}V${y - r * 0.4}Q${x - r * 1.1} ${y - r * 0.8} ${x - r * 0.7} ${y - r * 0.8}Z" ${at}/>`;
    // A leaf with its vein (the vein stays inside the outline).
    default: return `<g ${at}><path d="M${x - r * 1.1} ${y + r * 0.6}Q${x - r * 0.8} ${y - r * 1.1} ${x + r * 1.1} ${y - r * 0.7}Q${x + r * 0.8} ${y + r * 0.9} ${x - r * 1.1} ${y + r * 0.6}Z"/><path d="M${x - r * 0.7} ${y + r * 0.4}L${x + r * 0.45} ${y - r * 0.4}"/></g>`;
  }
}

/** A number from 0 up to 1 that is always the same for the same row, column and purpose (the Android app computes the identical one). */
export function doodleUnit(row: number, col: number, salt: number): number {
  let h = (Math.imul(row, 374761393) + Math.imul(col, 668265263) + Math.imul(salt, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h & 0x7fffffff) % 10000) / 10000;
}

/**
 * The doodles as a tile that repeats. Jumbled, not lined up, and full: every shape sits a little off its place, at its own size, turned any way,
 * some a little fainter, the way the big messengers scatter theirs. A shape that crosses the edge of the tile is drawn again on the far side,
 * so the tile joins up with itself.
 */
export function doodleTile(accent: string, dark: boolean): string {
  const cell = 40;
  const cols = 28;
  const rows = 22;
  const w = cell * cols;
  const h = Math.round(cell * 0.95 * rows);
  const base = dark ? 0.26 : 0.22;
  let shapes = '';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (row % 2 === 0 ? cell / 2 : cell) + col * cell + (doodleUnit(row, col, 2) - 0.5) * 0.4 * cell;
      const y = cell / 2 + row * cell * 0.95 + (doodleUnit(row, col, 3) - 0.5) * 0.4 * cell;
      const r = 8.5 * (0.8 + 0.3 * doodleUnit(row, col, 4));
      const turn = doodleUnit(row, col, 5) * 360;
      const kind = Math.min(DOODLE_KINDS - 1, Math.floor(doodleUnit(row, col, 6) * DOODLE_KINDS));
      const opacity = (base * (0.8 + 0.2 * doodleUnit(row, col, 7))).toFixed(3);
      let one = '';
      for (const dx of [0, -w, w]) {
        for (const dy of [0, -h, h]) {
          const px = x + dx;
          const py = y + dy;
          if (px < -r * 2 || px > w + r * 2 || py < -r * 2 || py > h + r * 2) continue;
          one += doodle(kind, px, py, r, turn);
        }
      }
      shapes += `<g stroke-opacity="${opacity}">${one}</g>`;
    }
  }
  return enc(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" stroke="${accent}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`);
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
