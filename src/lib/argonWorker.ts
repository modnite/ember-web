// Runs Argon2id (WebAssembly) off the main thread, so the page never freezes while a passphrase is derived.
import { argon2idWasm, type ArgonParams } from './argonWasm';

interface Req {
  id: number;
  password: Uint8Array;
  salt: Uint8Array;
  params: ArgonParams;
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const { id, password, salt, params } = ev.data;
  try {
    const out = await argon2idWasm(password, salt, params);
    (self as unknown as Worker).postMessage({ id, out }, [out.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String((err as Error)?.message ?? err) });
  }
};
