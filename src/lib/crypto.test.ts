import { describe, expect, it } from 'vitest';
import {
  decryptBytes,
  decryptText,
  deriveKeysFromMaster,
  deriveKeysFromPassphrase,
  encryptBytes,
  encryptText,
  isEncrypted,
  keyFingerprint,
} from './crypto';

// Fast Argon2 params so tests stay quick; production uses the defaults.
const LIGHT = { t: 1, m: 8 * 1024, p: 1, dkLen: 32 };

const keys = deriveKeysFromPassphrase('correct horse battery staple', LIGHT);
const other = deriveKeysFromPassphrase('a different passphrase', LIGHT);

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

describe('key derivation', () => {
  it('is deterministic for the same passphrase', () => {
    const again = deriveKeysFromPassphrase('correct horse battery staple', LIGHT);
    expect(again.kid).toBe(keys.kid);
    expect(again.chat).toEqual(keys.chat);
  });

  it('separates keys by purpose', () => {
    expect(keys.media).not.toEqual(keys.chat);
    expect(keys.chat).not.toEqual(keys.file);
  });

  it('gives a different key id for a different passphrase', () => {
    expect(other.kid).not.toBe(keys.kid);
  });

  it('exposes a readable fingerprint', () => {
    expect(keyFingerprint(keys)).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4})*$/);
  });
});

describe('text encryption', () => {
  const roomId = 'room-123';
  const message = 'see you at 8 - bring the good headphones';

  it('round-trips', () => {
    const encrypted = encryptText(keys, roomId, message);
    expect(isEncrypted(encrypted)).toBe(true);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(encrypted).not.toContain('headphones');
    expect(decryptText(keys, roomId, encrypted)).toBe(message);
  });

  it('uses a fresh nonce each time', () => {
    expect(encryptText(keys, roomId, message)).not.toBe(encryptText(keys, roomId, message));
  });

  it('is scoped per room', () => {
    const a = encryptText(keys, 'room-a', message);
    const b = encryptText(keys, 'room-b', message);
    expect(() => decryptText(keys, 'room-b', a)).toThrow();
    expect(() => decryptText(keys, 'room-a', b)).toThrow();
  });

  it('fails with the wrong passphrase', () => {
    const encrypted = encryptText(keys, roomId, message);
    expect(() => decryptText(other, roomId, encrypted)).toThrow();
  });

  it('detects tampering', () => {
    const parts = encryptText(keys, roomId, message).split(':');
    const ct = b64ToBytes(parts[4]!);
    ct[0] = ct[0]! ^ 0x01;
    parts[4] = bytesToB64(ct);
    expect(() => decryptText(keys, roomId, parts.join(':'))).toThrow();
  });

  it('passes plaintext through untouched', () => {
    expect(decryptText(keys, roomId, 'hello world')).toBe('hello world');
    expect(isEncrypted('hello world')).toBe(false);
  });
});

describe('file encryption', () => {
  const roomId = 'room-files';
  const bytes = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 256);

  it('round-trips arbitrary bytes', () => {
    const { envelope, data } = encryptBytes(keys, roomId, bytes);
    expect(envelope.kid).toBe(keys.kid);
    expect(data).not.toEqual(bytes);
    expect(decryptBytes(keys, roomId, envelope, data)).toEqual(bytes);
  });

  it('fails with the wrong passphrase', () => {
    const { envelope, data } = encryptBytes(keys, roomId, bytes);
    expect(() => decryptBytes(other, roomId, envelope, data)).toThrow();
  });
});

describe('master key round-trip', () => {
  it('derives working keys from a master', () => {
    const master = new Uint8Array(32).fill(7);
    const k = deriveKeysFromMaster(master);
    const encrypted = encryptText(k, 'r', 'hi');
    expect(decryptText(k, 'r', encrypted)).toBe('hi');
  });
});
