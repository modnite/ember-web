// Device identity + group-key acquisition for forward-secret E2EE.
//
// The private key stays in this browser; the group key Θ is never derived from
// a passphrase, only from a wrap this device can open. See docs/E2EE-RATCHET.md.
import { api, type E2eeWrap } from './api';
import { deviceId as deviceIdForIdentity } from './device';
import {
  base64ToBytes,
  bytesToBase64,
  generateGroupKey,
  generateIdentity,
  groupKeyId,
  publicKeyFromB64,
  publicKeyOf,
  publicKeyToB64,
  unwrapGroupKey,
  wrapGroupKey,
} from './crypto';

export interface DeviceIdentity {
  deviceId: string;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface GroupState {
  status: 'none' | 'waiting' | 'ready';
  key: Uint8Array | null;
  kid: string | null;
  deviceId: string;
  publicKey: string;
}

const DEVICE_KEY = 'hearth.device';

export function loadOrCreateDevice(): DeviceIdentity {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_KEY) : null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { deviceId: string; secretKey: string };
      const secretKey = base64ToBytes(parsed.secretKey);
      return { deviceId: parsed.deviceId, secretKey, publicKey: publicKeyOf(secretKey) };
    } catch {
      /* regenerate below */
    }
  }
  const { secretKey, publicKey } = generateIdentity();
  const deviceId = deviceIdForIdentity();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      DEVICE_KEY,
      JSON.stringify({ deviceId, secretKey: bytesToBase64(secretKey) }),
    );
  }
  return { deviceId, secretKey, publicKey };
}

export function forgetDevice(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(DEVICE_KEY);
}

function tryUnwrap(device: DeviceIdentity, wraps: E2eeWrap[]): { key: Uint8Array; kid: string } | null {
  for (let i = wraps.length - 1; i >= 0; i--) {
    const w = wraps[i]!;
    try {
      return { key: unwrapGroupKey(device.secretKey, { v: 1, eph: w.eph, n: w.n, ct: w.ct }), kid: w.keyId };
    } catch {
      /* this wrap isn't for us */
    }
  }
  return null;
}

function stateOf(device: DeviceIdentity, status: GroupState['status'], key: Uint8Array | null, kid: string | null): GroupState {
  return { status, key, kid, deviceId: device.deviceId, publicKey: publicKeyToB64(device.publicKey) };
}

/** Register, obtain Θ, and hand Θ to any device that lacks it. */
export async function ensureGroupKey(
  device: DeviceIdentity,
  opts: { createIfMissing?: boolean } = {},
): Promise<GroupState> {
  const reg = await api.e2eeRegisterDevice(device.deviceId, publicKeyToB64(device.publicKey));
  let owned = tryUnwrap(device, reg.wraps);

  if (!owned && opts.createIfMissing && !reg.hasGroupKey) {
    const key = generateGroupKey();
    const kid = groupKeyId(key);
    const wrapped = wrapGroupKey(device.publicKey, key);
    await api.e2eeWrap({
      senderDevice: device.deviceId,
      recipientDevice: device.deviceId,
      keyId: kid,
      wrapped,
    });
    owned = { key, kid };
  }

  if (!owned) return stateOf(device, reg.hasGroupKey ? 'waiting' : 'none', null, null);

  await approveOthers(device, owned.key, owned.kid);
  return stateOf(device, 'ready', owned.key, owned.kid);
}

/** Wrap Θ to every device that doesn't have this key id yet (best effort). */
async function approveOthers(device: DeviceIdentity, key: Uint8Array, kid: string): Promise<void> {
  try {
    const { devices } = await api.e2eeDevices();
    for (const d of devices) {
      if (d.keyIds.includes(kid)) continue;
      const wrapped = wrapGroupKey(publicKeyFromB64(d.publicKey), key);
      await api.e2eeWrap({ senderDevice: device.deviceId, recipientDevice: d.id, keyId: kid, wrapped });
    }
  } catch {
    /* approving is opportunistic */
  }
}

/** Generate a fresh Θ and wrap it to every device (drops the old key for FS). */
export async function rotateGroupKey(device: DeviceIdentity): Promise<GroupState> {
  const key = generateGroupKey();
  const kid = groupKeyId(key);
  const { devices } = await api.e2eeDevices();
  const targets = new Map<string, Uint8Array>();
  targets.set(device.deviceId, device.publicKey);
  for (const d of devices) targets.set(d.id, publicKeyFromB64(d.publicKey));
  for (const [id, pub] of targets) {
    await api.e2eeWrap({
      senderDevice: device.deviceId,
      recipientDevice: id,
      keyId: kid,
      wrapped: wrapGroupKey(pub, key),
    });
  }
  return stateOf(device, 'ready', key, kid);
}
