// A sound file chosen for new messages or for ringing, kept in this browser (IndexedDB, as bytes: Safari and WebKit shells refuse a Blob there).

export type SoundSlot = 'message' | 'call';

const DB = 'ember-sounds';
const MAX_BYTES = 3 * 1024 * 1024;

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

interface Row {
  data: ArrayBuffer;
  type: string;
  name: string;
}

const urls = new Map<SoundSlot, { url: string; name: string }>();

/** Keep a sound for a slot. Returns an error message, or null when it was kept. */
export async function saveSound(slot: SoundSlot, file: File): Promise<string | null> {
  if (!file.type.startsWith('audio/')) return 'That is not a sound file.';
  if (file.size > MAX_BYTES) return 'That sound is too long. Keep it under 3 MB.';
  try {
    const data = await file.arrayBuffer();
    await run('readwrite', (s) => s.put({ data, type: file.type, name: file.name } satisfies Row, slot));
  } catch {
    return 'This browser could not keep that sound.';
  }
  const old = urls.get(slot);
  if (old) URL.revokeObjectURL(old.url);
  urls.delete(slot);
  return null;
}

/** The chosen sound, as an address the page can play, or null when none is kept. */
export async function loadSound(slot: SoundSlot): Promise<{ url: string; name: string } | null> {
  const cached = urls.get(slot);
  if (cached) return cached;
  try {
    const row = await run('readonly', (s) => s.get(slot) as IDBRequest<Row | undefined>);
    if (!row) return null;
    const made = { url: URL.createObjectURL(new Blob([row.data], { type: row.type })), name: row.name };
    urls.set(slot, made);
    return made;
  } catch {
    return null;
  }
}

export async function clearSound(slot: SoundSlot): Promise<void> {
  const old = urls.get(slot);
  if (old) URL.revokeObjectURL(old.url);
  urls.delete(slot);
  try {
    await run('readwrite', (s) => s.delete(slot));
  } catch {
    /* nothing to remove */
  }
}
