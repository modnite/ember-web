// Hearth's end-to-end encryption: one shared group passphrase, no public keys.
//
//   passphrase ──Argon2id──► master ──HKDF──► k_media / k_chat / k_file
//                                          └──HKDF(room)──► per-room key
//                                               └── XChaCha20-Poly1305
//
// This module is isomorphic: the browser and the test runner both use it.
// The server never runs it; it only ever sees ciphertext.
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { argon2id } from '@noble/hashes/argon2.js';
import { deriveArgon } from './argon';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  bytesToHex,
  randomBytes,
  utf8ToBytes,
} from '@noble/hashes/utils.js';

export interface GroupKeys {
  /** Short fingerprint of the passphrase; tags every ciphertext for rotation. */
  kid: string;
  media: Uint8Array;
  chat: Uint8Array;
  file: Uint8Array;
}

export interface ArgonParams {
  t: number;
  m: number;
  p: number;
  dkLen: number;
}

// A fixed application salt. Argon2id's cost, not the salt, is what makes the
// passphrase expensive to guess; a per-group salt would add a server round-trip
// for no real gain here.
const APP_SALT = utf8ToBytes('hearth-e2ee-v1');
export const DEFAULT_ARGON: ArgonParams = { t: 3, m: 64 * 1024, p: 1, dkLen: 32 };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function deriveKeysFromPassphrase(
  passphrase: string,
  argon: ArgonParams = DEFAULT_ARGON,
): GroupKeys {
  const password = utf8ToBytes(passphrase.normalize('NFKC'));
  const master = argon2id(password, APP_SALT, argon);
  return deriveKeysFromMaster(master);
}

/** The slow part alone (Argon2id, 64 MiB x 3 passes in JavaScript: seconds on a desktop, tens of
 *  seconds on a phone in Safari). Callers keep the result so it is only ever paid once per device. */
export async function deriveMasterAsync(
  passphrase: string,
  argon: ArgonParams = DEFAULT_ARGON,
): Promise<Uint8Array> {
  return deriveArgon(utf8ToBytes(passphrase.normalize('NFKC')), APP_SALT, argon);
}

/** Non-blocking variant for the UI (Argon2 with real parameters takes a moment). */
export async function deriveKeysFromPassphraseAsync(
  passphrase: string,
  argon: ArgonParams = DEFAULT_ARGON,
): Promise<GroupKeys> {
  return deriveKeysFromMaster(await deriveMasterAsync(passphrase, argon));
}

export function deriveKeysFromMaster(master: Uint8Array): GroupKeys {
  const media = hkdf(sha256, master, APP_SALT, utf8ToBytes('hearth:media'), 32);
  const chat = hkdf(sha256, master, APP_SALT, utf8ToBytes('hearth:chat'), 32);
  const file = hkdf(sha256, master, APP_SALT, utf8ToBytes('hearth:file'), 32);
  const kid = bytesToHex(sha256(master)).slice(0, 12);
  return { kid, media, chat, file };
}

function subkey(root: Uint8Array, context: string): Uint8Array {
  return hkdf(sha256, root, APP_SALT, utf8ToBytes(context), 32);
}

// ---------------------------------------------------------------- text

const TEXT_PREFIX = 'enc:v1:';

export function isEncrypted(body: string): boolean {
  return body.startsWith(TEXT_PREFIX);
}

export function encryptText(keys: GroupKeys, roomId: string, plaintext: string): string {
  const key = subkey(keys.chat, `hearth:room:${roomId}`);
  const nonce = randomBytes(24);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(encoder.encode(plaintext));
  return `${TEXT_PREFIX}${keys.kid}:${b64(nonce)}:${b64(ciphertext)}`;
}

/** Returns the plaintext, or the original body if it was never encrypted. */
export function decryptText(keys: GroupKeys, roomId: string, body: string): string {
  if (!isEncrypted(body)) return body;
  const parts = body.split(':');
  // enc : v1 : kid : nonce : ciphertext
  if (parts.length !== 5 || parts[1] !== 'v1') throw new Error('malformed encrypted message');
  const kid = parts[2]!;
  if (kid !== keys.kid) throw new Error('message was encrypted with a different passphrase');
  const key = subkey(keys.chat, `hearth:room:${roomId}`);
  const ciphertext = xchacha20poly1305(key, ub64(parts[3]!)).decrypt(ub64(parts[4]!));
  return decoder.decode(ciphertext);
}

// ---------------------------------------------------------------- bytes (files)

export interface FileEnvelope {
  v: 1 | 2;
  kid: string;
  n: string; // base64 nonce
  mime?: string; // remembered so encrypted images can still be rendered
}

export function encryptBytes(
  keys: GroupKeys,
  roomId: string,
  data: Uint8Array,
): { envelope: FileEnvelope; data: Uint8Array } {
  const key = subkey(keys.file, `hearth:room:${roomId}`);
  const nonce = randomBytes(24);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(data);
  return { envelope: { v: 1, kid: keys.kid, n: b64(nonce) }, data: ciphertext };
}

export function decryptBytes(
  keys: GroupKeys,
  roomId: string,
  envelope: FileEnvelope,
  data: Uint8Array,
): Uint8Array {
  if (envelope.kid !== keys.kid) throw new Error('file was encrypted with a different passphrase');
  const key = subkey(keys.file, `hearth:room:${roomId}`);
  return xchacha20poly1305(key, ub64(envelope.n)).decrypt(data);
}

// ---------------------------------------------------------------- media (LiveKit)

/** LiveKit's E2EE wants the key as a base64 string. */
export function mediaKeyString(keys: GroupKeys): string {
  return b64(keys.media);
}

/** A stable, non-secret fingerprint people can compare out of band. */
export function keyFingerprint(keys: GroupKeys): string {
  return keys.kid.match(/.{1,4}/g)?.join(' ') ?? keys.kid;
}

// ---------------------------------------------------------------- forward secrecy
//
// Forward secrecy needs the message root key to be a *secret that is not
// derivable from the passphrase*. So the passphrase no longer generates message
// keys directly. Instead:
//
//   1. every device has an X25519 identity keypair (private key never leaves it)
//   2. a random group key Θ encrypts messages (via per-room subkeys)
//   3. Θ is handed to a device by wrapping it to that device's public key
//
// Because Θ is random, a leaked passphrase cannot reconstruct it, so old
// ciphertext stays unreadable. Adding a new device needs an existing one to wrap
// Θ to it — the trade for real forward secrecy.

import { x25519 } from '@noble/curves/ed25519.js';

export interface IdentityKeyPair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface WrappedKey {
  v: 1;
  eph: string; // base64 ephemeral X25519 public key
  n: string; // base64 nonce
  ct: string; // base64 sealed group key
}

export function generateIdentity(): IdentityKeyPair {
  const { secretKey, publicKey } = x25519.keygen();
  return { secretKey, publicKey };
}

export const publicKeyToB64 = (pk: Uint8Array): string => b64(pk);
export const publicKeyFromB64 = (s: string): Uint8Array => ub64(s);
export const bytesToBase64 = (bytes: Uint8Array): string => b64(bytes);
export const base64ToBytes = (value: string): Uint8Array => ub64(value);

export function publicKeyOf(secretKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(secretKey);
}

export function generateGroupKey(): Uint8Array {
  return randomBytes(32);
}

/** A short, non-secret fingerprint of a group key (changes when it rotates). */
export function groupKeyId(groupKey: Uint8Array): string {
  return bytesToHex(sha256(groupKey)).slice(0, 12);
}

export function wrapGroupKey(recipientPublicKey: Uint8Array, groupKey: Uint8Array): WrappedKey {
  const ephemeral = x25519.keygen();
  const shared = x25519.getSharedSecret(ephemeral.secretKey, recipientPublicKey);
  const wrapKey = hkdf(sha256, shared, APP_SALT, utf8ToBytes('hearth:wrap'), 32);
  const nonce = randomBytes(24);
  const ciphertext = xchacha20poly1305(wrapKey, nonce).encrypt(groupKey);
  return { v: 1, eph: b64(ephemeral.publicKey), n: b64(nonce), ct: b64(ciphertext) };
}

export function unwrapGroupKey(secretKey: Uint8Array, wrapped: WrappedKey): Uint8Array {
  const shared = x25519.getSharedSecret(secretKey, ub64(wrapped.eph));
  const wrapKey = hkdf(sha256, shared, APP_SALT, utf8ToBytes('hearth:wrap'), 32);
  return xchacha20poly1305(wrapKey, ub64(wrapped.n)).decrypt(ub64(wrapped.ct));
}

export function roomKeyFromGroup(groupKey: Uint8Array, roomId: string, purpose = 'chat'): Uint8Array {
  return hkdf(sha256, groupKey, APP_SALT, utf8ToBytes(`hearth:${purpose}:${roomId}`), 32);
}

/** LiveKit wants the E2EE media key as a base64 string. */
export function mediaKeyFromGroup(groupKey: Uint8Array, roomId: string): string {
  return b64(roomKeyFromGroup(groupKey, roomId, 'media'));
}

/** Seal arbitrary bytes (a file) with a caller-supplied key. */
export function sealBytes(
  key: Uint8Array,
  kid: string,
  data: Uint8Array,
  mime?: string,
): { envelope: FileEnvelope; data: Uint8Array } {
  const nonce = randomBytes(24);
  return {
    envelope: { v: 2, kid, n: b64(nonce), mime },
    data: xchacha20poly1305(key, nonce).encrypt(data),
  };
}

export function openBytes(key: Uint8Array, envelope: FileEnvelope, data: Uint8Array): Uint8Array {
  return xchacha20poly1305(key, ub64(envelope.n)).decrypt(data);
}

const V2_PREFIX = 'enc:v2:';

export function isEncryptedV2(body: string): boolean {
  return body.startsWith(V2_PREFIX);
}

export function encryptWithRoomKey(roomKey: Uint8Array, kid: string, plaintext: string): string {
  const nonce = randomBytes(24);
  const ciphertext = xchacha20poly1305(roomKey, nonce).encrypt(encoder.encode(plaintext));
  return `${V2_PREFIX}${kid}:${b64(nonce)}:${b64(ciphertext)}`;
}

export function decryptWithRoomKey(roomKey: Uint8Array, body: string): string {
  if (!isEncryptedV2(body)) throw new Error('not a v2 ciphertext');
  const parts = body.split(':');
  // enc : v2 : kid : nonce : ciphertext
  if (parts.length !== 5) throw new Error('malformed v2 ciphertext');
  const ciphertext = xchacha20poly1305(roomKey, ub64(parts[3]!)).decrypt(ub64(parts[4]!));
  return decoder.decode(ciphertext);
}

// ---------------------------------------------------------------- helpers

export function encodeEnvelope(envelope: FileEnvelope): string {
  return b64(utf8ToBytes(JSON.stringify(envelope)));
}

export function decodeEnvelope(value: string): FileEnvelope {
  return JSON.parse(decoder.decode(ub64(value))) as FileEnvelope;
}

function b64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function ub64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
