// Passphrase key derivation: Argon2id in a WebAssembly worker, with the pure-JS implementation as the fallback.
// Both give identical bytes (see argon.test.ts). The WASM one is many times faster and runs off the main thread;
// the JS one is used when WebAssembly or workers are missing, when the worker fails, or when the browser cannot
// allocate the 64 MiB of WASM memory (Safari on iOS can refuse in some contexts).
import { argon2idAsync } from '@noble/hashes/argon2.js';
import type { ArgonParams } from './argonWasm';
import { perfLog } from './perf';

export type ArgonEngine = 'wasm' | 'js';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { ok: (b: Uint8Array) => void; fail: (e: Error) => void }>();
/** Which engine did the last derivation, and a plain sentence when it was the fallback. */
export const argonStatus: { engine: ArgonEngine | null; notice: string | null } = { engine: null, notice: null };

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./argonWorker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (ev: MessageEvent<{ id: number; out?: Uint8Array; error?: string }>) => {
    const p = pending.get(ev.data.id);
    if (!p) return;
    pending.delete(ev.data.id);
    if (ev.data.out) p.ok(ev.data.out);
    else p.fail(new Error(ev.data.error || 'argon worker failed'));
  };
  w.onerror = () => {
    for (const p of pending.values()) p.fail(new Error('argon worker crashed'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  worker = w;
  return w;
}

function viaWorker(password: Uint8Array, salt: Uint8Array, params: ArgonParams): Promise<Uint8Array> {
  return new Promise((ok, fail) => {
    const id = ++seq;
    pending.set(id, { ok, fail });
    try {
      getWorker().postMessage({ id, password, salt, params });
    } catch (e) {
      pending.delete(id);
      fail(e as Error);
    }
  });
}

/** Called the moment the slower method is chosen, so the screen can say so while it works. */
let noticeListener: ((n: string) => void) | null = null;
export function setArgonNoticeListener(fn: ((n: string) => void) | null): void {
  noticeListener = fn;
}

export function wasmAvailable(): boolean {
  return typeof WebAssembly !== 'undefined' && typeof Worker !== 'undefined';
}

export async function deriveArgon(password: Uint8Array, salt: Uint8Array, params: ArgonParams): Promise<Uint8Array> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  if (wasmAvailable()) {
    try {
      // The worker gets a copy: the caller's bytes stay usable for the fallback.
      const out = await viaWorker(password.slice(), salt.slice(), params);
      argonStatus.engine = 'wasm';
      argonStatus.notice = null;
      perfLog('argon2id (wasm)', t0);
      return out;
    } catch (err) {
      argonStatus.notice =
        /memory|alloc|range/i.test(String((err as Error)?.message))
          ? 'This browser could not set aside the memory for the fast method, so the slower compatible one is being used. It can take up to half a minute.'
          : 'The fast method is not available here, so the slower compatible one is being used. It can take up to half a minute.';
    }
  } else {
    argonStatus.notice = 'The fast method is not available in this browser, so the slower compatible one is being used. It can take up to half a minute.';
  }
  if (argonStatus.notice) noticeListener?.(argonStatus.notice);
  const out = await argon2idAsync(password, salt, params);
  argonStatus.engine = 'js';
  perfLog('argon2id (js fallback)', t0);
  return out;
}
