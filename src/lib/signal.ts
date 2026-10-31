// Signal's public sticker packs, the same ones the Android app offers. A pack is public but sealed: anyone with the pack's key (the public
// directory lists it) can fetch and open it, with no account. The key makes two keys with HKDF (an AES key and a MAC key). Every file is a
// 16 byte IV, the AES-CBC data and a 32 byte MAC. The pictures come straight from Signal's servers to this browser.

export interface SignalPack {
  id: string;
  key: string;
  tags: string[];
}

export interface SignalSticker {
  id: number;
  emoji: string;
}

export interface SignalManifest {
  title: string;
  author: string;
  cover: number;
  stickers: SignalSticker[];
}

export class SignalError extends Error {}

const CDN = 'https://cdn-ca.signal.org/stickers';
const DIRECTORY_URL = 'https://raw.githubusercontent.com/signalstickers/stickers/master/src/stickers.yml';

export const fromHex = (hex: string): Uint8Array => Uint8Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));

const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** HKDF-SHA256 with a zero salt and the label "Sticker Pack": 64 bytes, split into the AES key and the MAC key. */
export async function packKeys(packKey: string): Promise<{ aes: Uint8Array; mac: Uint8Array }> {
  const base = await crypto.subtle.importKey('raw', fromHex(packKey) as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('Sticker Pack') }, base, 512);
  const all = new Uint8Array(bits);
  return { aes: all.slice(0, 32), mac: all.slice(32) };
}

/** The clear bytes of a sealed file. Throws when it was tampered with or the key is wrong. */
export async function openSealed(packKey: string, blob: Uint8Array): Promise<Uint8Array> {
  if (blob.length <= 16 + 32) throw new SignalError('Too short to be a sealed sticker file.');
  const { aes, mac } = await packKeys(packKey);
  const body = blob.slice(0, blob.length - 32);
  const tag = blob.slice(blob.length - 32);
  const macKey = await crypto.subtle.importKey('raw', mac as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', macKey, body as BufferSource));
  if (!same(expected, tag)) throw new SignalError('Sticker file does not match its key.');
  const aesKey = await crypto.subtle.importKey('raw', aes as BufferSource, 'AES-CBC', false, ['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: body.slice(0, 16) as BufferSource }, aesKey, body.slice(16) as BufferSource));
}

class Reader {
  i = 0;
  constructor(private readonly b: Uint8Array) {}
  more(): boolean {
    return this.i < this.b.length;
  }
  varint(): number {
    let shift = 0;
    let out = 0;
    for (;;) {
      const x = this.b[this.i++] ?? 0;
      out += (x & 0x7f) * 2 ** shift;
      if ((x & 0x80) === 0) return out;
      shift += 7;
    }
  }
  bytes(): Uint8Array {
    const n = this.varint();
    const r = this.b.slice(this.i, this.i + n);
    this.i += n;
    return r;
  }
  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.i += 8;
    else if (wire === 2) this.bytes();
    else if (wire === 5) this.i += 4;
    else this.i = this.b.length;
  }
}

const text = (b: Uint8Array): string => new TextDecoder().decode(b);

function readSticker(b: Uint8Array): SignalSticker {
  const r = new Reader(b);
  let id = 0;
  let emoji = '';
  while (r.more()) {
    const tag = r.varint();
    if (tag === 8) id = r.varint();
    else if (tag === 18) emoji = text(r.bytes());
    else r.skip(tag & 7);
  }
  return { id, emoji };
}

/** The pack's description (protobuf: title 1, author 2, cover 3, stickers 4). */
export function parseManifest(clear: Uint8Array): SignalManifest {
  const r = new Reader(clear);
  const out: SignalManifest = { title: '', author: '', cover: 0, stickers: [] };
  while (r.more()) {
    const tag = r.varint();
    if (tag === 10) out.title = text(r.bytes());
    else if (tag === 18) out.author = text(r.bytes());
    else if (tag === 26) out.cover = readSticker(r.bytes()).id;
    else if (tag === 34) out.stickers.push(readSticker(r.bytes()));
    else r.skip(tag & 7);
  }
  return out;
}

/** The directory's YAML: an entry per pack (32 hex id, its key, tags), without the ones marked not safe for work. Only the little this needs is read. */
export function parseDirectory(yaml: string): SignalPack[] {
  const out: SignalPack[] = [];
  let id: string | null = null;
  let key: string | null = null;
  let tags: string[] = [];
  let nsfw = false;
  let inTags = false;
  const unquote = (s: string): string => s.trim().replace(/^['"]|['"]$/g, '');
  const flush = (): void => {
    if (id && key && !nsfw && !tags.some((t) => t.toLowerCase() === 'nsfw')) out.push({ id, key, tags });
    id = null;
    key = null;
    tags = [];
    nsfw = false;
    inTags = false;
  };
  for (const line of yaml.split('\n')) {
    const start = /^([0-9a-f]{32}):\s*$/.exec(line.replace(/\r$/, ''));
    if (start) {
      flush();
      id = start[1]!;
      continue;
    }
    const t = line.trim();
    if (t.startsWith('key:')) {
      const k = unquote(t.slice(4));
      key = k.length === 64 ? k : null;
      inTags = false;
    } else if (t.startsWith('nsfw:')) {
      nsfw = t.slice(5).trim().toLowerCase() === 'true';
      inTags = false;
    } else if (t.startsWith('tags:')) {
      inTags = true;
    } else if (inTags && t.startsWith('- ')) {
      tags.push(unquote(t.slice(2)));
    } else if (t && !t.startsWith('#')) {
      inTags = false;
    }
  }
  flush();
  return out;
}

/** Packs whose tags match every word of the query, the best matches first. An empty query gives the first ones in the directory. */
export function searchPacks(packs: SignalPack[], query: string, limit = 40): SignalPack[] {
  const words = query.toLowerCase().split(/[ ,]+/).filter(Boolean);
  if (!words.length) return packs.slice(0, limit);
  const scored: Array<[SignalPack, number]> = [];
  for (const p of packs) {
    const tags = p.tags.map((t) => t.toLowerCase());
    let score = 0;
    let all = true;
    for (const w of words) {
      const s = tags.some((t) => t === w) ? 3 : tags.some((t) => t.includes(w)) ? 1 : 0;
      if (!s) { all = false; break; }
      score += s;
    }
    if (all) scored.push([p, score]);
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([p]) => p);
}

/** What a sticker file is, from its first bytes. */
export function extensionOf(clear: Uint8Array): 'webp' | 'png' {
  const ascii = (from: number, n: number): string => String.fromCharCode(...clear.slice(from, from + n));
  if (clear.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
  if (clear.length > 4 && clear[0] === 0x89 && clear[1] === 0x50) return 'png';
  return 'webp';
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  let r: Response;
  try {
    r = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new SignalError('Could not reach Signal. Check your connection.');
  }
  if (!r.ok) throw new SignalError(`Signal's server answered ${r.status}.`);
  return new Uint8Array(await r.arrayBuffer());
}

const DIR_KEY = 'ember.signal.directory';
const DIR_AGE = 7 * 24 * 3600 * 1000;
let directory: Promise<SignalPack[]> | null = null;

/** The public directory of packs, from GitHub; kept in this browser and refreshed about once a week. */
export function loadDirectory(): Promise<SignalPack[]> {
  directory ??= (async () => {
    try {
      const saved = JSON.parse(localStorage.getItem(DIR_KEY) ?? 'null') as { at: number; packs: SignalPack[] } | null;
      if (saved && Date.now() - saved.at < DIR_AGE && saved.packs.length) return saved.packs;
    } catch {
      /* no saved copy */
    }
    let packs: SignalPack[];
    try {
      packs = parseDirectory(new TextDecoder().decode(await fetchBytes(DIRECTORY_URL)));
    } catch (e) {
      directory = null;
      throw e instanceof SignalError ? new SignalError('Could not load the list of sticker packs.') : e;
    }
    try {
      localStorage.setItem(DIR_KEY, JSON.stringify({ at: Date.now(), packs }));
    } catch {
      /* too big for this browser's storage: fetched again next time */
    }
    return packs;
  })();
  return directory;
}

const manifests = new Map<string, Promise<SignalManifest>>();

export function loadManifest(pack: SignalPack): Promise<SignalManifest> {
  let m = manifests.get(pack.id);
  if (!m) {
    m = fetchBytes(`${CDN}/${pack.id}/manifest.proto`).then((b) => openSealed(pack.key, b)).then(parseManifest);
    m.catch(() => manifests.delete(pack.id));
    manifests.set(pack.id, m);
  }
  return m;
}

const pictures = new Map<string, Promise<{ bytes: Uint8Array; ext: 'webp' | 'png' }>>();

/** One sticker of a pack, opened. */
export function loadSticker(pack: SignalPack, id: number): Promise<{ bytes: Uint8Array; ext: 'webp' | 'png' }> {
  const k = `${pack.id}-${id}`;
  let p = pictures.get(k);
  if (!p) {
    p = fetchBytes(`${CDN}/${pack.id}/full/${id}`).then((b) => openSealed(pack.key, b)).then((bytes) => ({ bytes, ext: extensionOf(bytes) }));
    p.catch(() => pictures.delete(k));
    pictures.set(k, p);
  }
  return p;
}

/** The sticker as a file ready to send, named the way every client draws stickers (sticker-…). */
export async function stickerFile(pack: SignalPack, id: number): Promise<File> {
  const { bytes, ext } = await loadSticker(pack, id);
  return new File([bytes as BlobPart], `sticker-signal-${pack.id.slice(0, 8)}-${id}.${ext}`, { type: ext === 'png' ? 'image/png' : 'image/webp' });
}
