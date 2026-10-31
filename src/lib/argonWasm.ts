// Argon2id in WebAssembly (hash-wasm, bundled locally: no CDN). Same function as @noble/hashes argon2id,
// byte for byte, for the same (password, salt, t, m, p, dkLen): the native client and every user's existing
// keys depend on that, and the known-answer test in argon.test.ts pins it.
import { argon2id } from 'hash-wasm';

export interface ArgonParams {
  /** Passes (iterations). */
  t: number;
  /** Memory in KiB. */
  m: number;
  /** Parallelism. */
  p: number;
  dkLen: number;
}

export async function argon2idWasm(password: Uint8Array, salt: Uint8Array, a: ArgonParams): Promise<Uint8Array> {
  return argon2id({
    password,
    salt,
    parallelism: a.p,
    iterations: a.t,
    memorySize: a.m,
    hashLength: a.dkLen,
    outputType: 'binary',
  });
}
