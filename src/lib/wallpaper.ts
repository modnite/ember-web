// A photo chosen as the chat wallpaper, kept in this browser (IndexedDB), scaled down to what a screen needs.

const DB = 'ember-wallpaper';
const KEY = 'photo';

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('files')) req.result.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction('files', mode).objectStore('files'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Scale a picked picture to at most 1800 pixels on its long side and keep it as a JPEG. */
export async function savePhoto(file: Blob): Promise<boolean> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * k));
    canvas.height = Math.max(1, Math.round(bmp.height * k));
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
    if (!jpeg) return false;
    // IndexedDB keeps the bytes (Safari and WebKit shells refuse a Blob), so the Blob is read first.
    const data = await jpeg.arrayBuffer();
    await run('readwrite', (s) => s.put({ data, type: 'image/jpeg' }, KEY));
    cached = null;
    return true;
  } catch {
    return false;
  }
}

let cached: string | null = null;

/** An address the page can draw the photo from, or null when none is kept. */
export async function loadPhoto(): Promise<string | null> {
  if (cached) return cached;
  try {
    const row = (await run('readonly', (s) => s.get(KEY) as IDBRequest<{ data: ArrayBuffer; type: string } | undefined>));
    if (!row) return null;
    cached = URL.createObjectURL(new Blob([row.data], { type: row.type }));
    return cached;
  } catch {
    return null;
  }
}

export async function hasPhoto(): Promise<boolean> {
  return !!(await loadPhoto());
}
