// Stickers and GIFs kept in this browser for sending again, newest first (IndexedDB: storage that holds pictures).
// A sticker is a 512 pixel picture named sticker-….webp (or .png where the browser cannot make WebP): that name is how every client knows
// to draw it without a bubble. A GIF keeps its own bytes and is named gif-….gif.

export type FavKind = 'sticker' | 'gif';

/** What is stored: the bytes themselves (Safari and WebKit shells refuse to keep a Blob in IndexedDB), turned into a Blob again when read. */
interface Stored {
  id: string;
  data: ArrayBuffer;
  type: string;
  name: string;
  added: number;
}

export interface Fav {
  id: string;
  blob: Blob;
  name: string;
  added: number;
}

const toFav = (r: Stored): Fav => ({ id: r.id, blob: new Blob([r.data], { type: r.type }), name: r.name, added: r.added });

const DB = 'ember-media';
const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      for (const s of ['sticker', 'gif']) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function run<T>(kind: FavKind, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(kind, mode).objectStore(kind));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

const ext = (type: string): string => (type === 'image/gif' ? 'gif' : type === 'image/png' ? 'png' : 'webp');

/** A short hash of the bytes, so the same picture added twice is kept once. */
export async function digest(blob: Blob): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(h).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function listFavs(kind: FavKind): Promise<Fav[]> {
  try {
    return (await run(kind, 'readonly', (s) => s.getAll() as IDBRequest<Stored[]>)).map(toFav).sort((a, b) => b.added - a.added);
  } catch {
    return [];
  }
}

export async function addFav(kind: FavKind, blob: Blob): Promise<Fav> {
  const id = await digest(blob);
  const row: Stored = { id, data: await blob.arrayBuffer(), type: blob.type, name: `${kind === 'sticker' ? 'sticker-' : 'gif-'}${id}.${ext(blob.type)}`, added: Date.now() };
  await run(kind, 'readwrite', (s) => s.put(row));
  return { id, blob, name: row.name, added: row.added };
}

export async function removeFav(kind: FavKind, id: string): Promise<void> {
  await run(kind, 'readwrite', (s) => s.delete(id));
}

/** Whether this picture is already kept. */
export async function hasFav(kind: FavKind, blob: Blob): Promise<boolean> {
  try {
    const id = await digest(blob);
    return !!(await run(kind, 'readonly', (s) => s.get(id) as IDBRequest<Stored | undefined>));
  } catch {
    return false;
  }
}

export const favFile = (f: Fav): File => new File([f.blob], f.name, { type: f.blob.type });

/** Make a sticker out of any picture: scaled to fit a 512 pixel square (see-through where the picture is), as WebP, or PNG where WebP cannot be made. */
export async function stickerFrom(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const toBlob = (type: string): Promise<Blob | null> => new Promise((r) => canvas.toBlob(r, type, 0.92));
  const webp = await toBlob('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const png = await toBlob('image/png');
  if (!png) throw new Error('This picture could not be made into a sticker.');
  return png;
}

/** True when the bytes begin like a GIF file. */
export async function isGif(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return String.fromCharCode(...head) === 'GIF8';
}
