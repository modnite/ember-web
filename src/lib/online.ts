// Places to search for GIFs and stickers, the same ones the Android app uses. The pictures come straight from each service to this browser.
// Giphy and Imgur need a key of your own (Settings); the others need nothing.

import { usePrefs } from './prefs';

export type MediaKind = 'gif' | 'sticker';

export interface OnlineItem {
  id: string;
  /** What the grid draws (small); null when the emoji character is drawn instead. */
  preview: string | null;
  /** The file downloaded and sent when it is picked. */
  send: string;
  ext: 'gif' | 'webp';
  title: string;
  glyph?: string;
}

export class OnlineError extends Error {}

export interface OnlineSource {
  id: string;
  label: string;
  kinds: MediaKind[];
  /** The Settings field this source waits for, if it needs a key. */
  needs?: 'giphyKey' | 'imgurId';
  search(kind: MediaKind, query: string): Promise<OnlineItem[]>;
}

const MAX_BYTES = 12 * 1024 * 1024;
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : undefined);
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

async function getJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(url, { headers, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new OnlineError('Could not reach the service. Check your connection.');
  }
  if (r.status === 401 || r.status === 403) throw new OnlineError('The service refused the key. Check it in Settings.');
  if (r.status === 429) throw new OnlineError('Too many searches. Try again in a minute.');
  if (!r.ok) throw new OnlineError(`The service answered ${r.status}.`);
  return r.json();
}

/** The JSON answers of each service turned into items. Kept apart from fetching so they can be tested on their own. */
export const parse = {
  giphy(json: unknown, kind: MediaKind): OnlineItem[] {
    const data = obj(json)?.data;
    if (!Array.isArray(data)) return [];
    const out: OnlineItem[] = [];
    for (const e of data) {
      const o = obj(e);
      const id = text(o?.id);
      const images = obj(o?.images);
      if (!o || !id || !images) continue;
      const title = text(o.title) ?? '';
      if (kind === 'sticker') {
        const send = text(obj(images.fixed_height)?.webp);
        if (!send) continue;
        out.push({ id, preview: text(obj(images.fixed_width_small)?.webp) ?? text(obj(images.fixed_width)?.webp) ?? send, send, ext: 'webp', title });
      } else {
        const send = text(obj(images.downsized_medium)?.url) ?? text(obj(images.fixed_height)?.url) ?? text(obj(images.original)?.url);
        if (!send) continue;
        out.push({ id, preview: text(obj(images.fixed_width_small)?.url) ?? text(obj(images.fixed_width)?.url) ?? send, send, ext: 'gif', title });
      }
    }
    return out;
  },

  imgur(json: unknown, maxBytes = 8 * 1024 * 1024): OnlineItem[] {
    const data = obj(json)?.data;
    if (!Array.isArray(data)) return [];
    const out: OnlineItem[] = [];
    const seen = new Set<string>();
    for (const e of data) {
      const post = obj(e);
      if (!post) continue;
      const inner = Array.isArray(post.images) ? post.images.map(obj).filter((x): x is Record<string, unknown> => !!x) : [];
      for (const c of [post, ...inner]) {
        const link = text(c.link);
        if (!link) continue;
        const isGif = c.type === 'image/gif' || link.toLowerCase().endsWith('.gif');
        if (!isGif || c.animated === false) continue;
        if (Number(c.size ?? 0) > maxBytes) continue;
        const id = text(c.id) ?? link;
        if (seen.has(id)) continue;
        seen.add(id);
        const secure = link.replace(/^http:\/\/(i\.)?imgur\.com\//, 'https://$1imgur.com/');
        out.push({ id, preview: secure, send: secure, ext: 'gif', title: text(c.title) ?? text(post.title) ?? '' });
      }
    }
    return out;
  },

  commons(json: unknown, maxBytes = 8 * 1024 * 1024): OnlineItem[] {
    const pages = obj(obj(obj(json)?.query)?.pages);
    if (!pages) return [];
    const out: OnlineItem[] = [];
    for (const p of Object.values(pages)) {
      const page = obj(p);
      const info = obj(Array.isArray(page?.imageinfo) ? page.imageinfo[0] : undefined);
      const url = text(info?.url);
      if (!page || !info || !url || info.mime !== 'image/gif' || Number(info.size ?? 0) > maxBytes) continue;
      out.push({ id: text(page.pageid) ?? url, preview: text(info.thumburl) ?? url, send: url, ext: 'gif', title: (text(page.title) ?? '').replace(/^File:/, '').replace(/\.gif$/i, '') });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  },

  nekos(json: unknown, category: string): OnlineItem[] {
    const results = obj(json)?.results;
    if (!Array.isArray(results)) return [];
    const out: OnlineItem[] = [];
    for (const e of results) {
      const o = obj(e);
      const url = text(o?.url);
      if (!o || !url) continue;
      out.push({ id: url.split('/').pop()!.split('.')[0]!, preview: url, send: url, ext: 'gif', title: [category, text(o.anime_name)].filter(Boolean).join(' · ') });
    }
    return out;
  },

  /** "code<TAB>name" per line. */
  animatedEmoji(raw: string): Array<[string, string]> {
    return raw.split('\n').flatMap((l) => {
      const [code, name] = l.replace(/\r$/, '').split('\t');
      return code && name ? [[code, name] as [string, string]] : [];
    });
  },

  /** "2764_fe0f" is the heart, "1f600" the grin. */
  glyph: (code: string): string => code.split('_').map((h) => String.fromCodePoint(parseInt(h, 16))).join(''),
};

const enc = encodeURIComponent;

const giphy: OnlineSource = {
  id: 'giphy', label: 'Giphy', kinds: ['gif', 'sticker'], needs: 'giphyKey',
  async search(kind, query) {
    const key = usePrefs.getState().giphyKey.trim();
    const path = kind === 'sticker' ? 'stickers' : 'gifs';
    const url = query.trim()
      ? `https://api.giphy.com/v1/${path}/search?api_key=${enc(key)}&q=${enc(query)}&limit=36&rating=pg-13&lang=en`
      : `https://api.giphy.com/v1/${path}/trending?api_key=${enc(key)}&limit=36&rating=pg-13`;
    return parse.giphy(await getJson(url), kind);
  },
};

const imgur: OnlineSource = {
  id: 'imgur', label: 'Imgur', kinds: ['gif'], needs: 'imgurId',
  async search(_kind, query) {
    const q = query.trim() || 'reaction';
    return parse.imgur(await getJson(`https://api.imgur.com/3/gallery/search/viral/all/0?q=${enc(q)}&q_type=gif`, { Authorization: `Client-ID ${usePrefs.getState().imgurId.trim()}` }));
  },
};

const commons: OnlineSource = {
  id: 'commons', label: 'Wikimedia', kinds: ['gif'],
  async search(_kind, query) {
    const q = query.trim() || 'animated';
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${enc(`filetype:bitmap ${q} gif`)}&gsrnamespace=6&gsrlimit=36&prop=imageinfo&iiprop=url%7Cmime%7Csize&iiurlwidth=240&format=json&origin=*`;
    return parse.commons(await getJson(url));
  },
};

const POPULAR = ['laugh', 'hug', 'dance', 'wave', 'smile', 'thumbsup', 'happy', 'wink', 'cry', 'nod', 'shrug', 'facepalm'];
let categories: string[] | null = null;
const reactions: OnlineSource = {
  id: 'reactions', label: 'Reactions', kinds: ['gif'],
  async search(_kind, query) {
    const one = async (c: string, n: number): Promise<OnlineItem[]> => parse.nekos(await getJson(`https://nekos.best/api/v2/${enc(c)}?amount=${n}`), c);
    const q = query.trim().toLowerCase();
    if (!q) return (await Promise.all(POPULAR.map((c) => one(c, 4).catch(() => [] as OnlineItem[])))).flat();
    if (!categories) {
      try {
        const all = obj(await getJson('https://nekos.best/api/v2/endpoints')) ?? {};
        categories = Object.keys(all).filter((k) => obj(all[k])?.format === 'gif');
      } catch {
        categories = POPULAR;
      }
    }
    const matching = categories.filter((c) => c.includes(q) || q.includes(c)).slice(0, 3);
    if (!matching.length) throw new OnlineError(`No reactions for that. Try: ${categories.slice(0, 10).join(', ')}.`);
    return (await Promise.all(matching.map((c) => one(c, Math.floor(20 / matching.length))))).flat();
  },
};

let emojiList: Promise<Array<[string, string]>> | null = null;
const animatedEmoji: OnlineSource = {
  id: 'emoji', label: 'Animated emoji', kinds: ['sticker'],
  async search(_kind, query) {
    emojiList ??= import('../data/animated-emoji.txt?raw').then((m) => parse.animatedEmoji(m.default));
    const q = query.trim().toLowerCase();
    const all = await emojiList;
    return all
      .filter(([code, name]) => !q || name.includes(q) || parse.glyph(code) === q)
      .slice(0, 120)
      .map(([code, name]) => ({ id: code, preview: null, send: `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.webp`, ext: 'webp' as const, title: name, glyph: parse.glyph(code) }));
  },
};

/** The places that need nothing come first; Giphy and Imgur only work once you give them a key. */
export const sources: OnlineSource[] = [animatedEmoji, reactions, commons, giphy, imgur];
export const sourcesFor = (kind: MediaKind): OnlineSource[] => sources.filter((s) => s.kinds.includes(kind));

/** The picture to send, as a file named the way every client expects (sticker-… or gif-…). Refuses anything bigger than a chat should carry. */
export async function download(item: OnlineItem, kind: MediaKind): Promise<File> {
  let r: Response;
  try {
    r = await fetch(item.send, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new OnlineError('Could not download that. The service may not allow it from a browser.');
  }
  if (!r.ok) throw new OnlineError(`Could not download that (${r.status}).`);
  const blob = await r.blob();
  if (blob.size > MAX_BYTES) throw new OnlineError('That one is too big to send.');
  const safe = item.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'x';
  const type = item.ext === 'webp' ? 'image/webp' : 'image/gif';
  return new File([blob], `${kind === 'sticker' ? 'sticker-' : 'gif-'}${safe}.${item.ext}`, { type });
}
