// One id per browser install, so a user on two devices is two identities: they
// can be signed in on both at once and be in the same call from both. The E2EE
// code keeps its own key pair alongside this id.
const KEY = 'hearth.deviceId';

let cached: string | null = null;

/** The stable per-browser device id. */
export function deviceId(): string {
  if (cached) return cached;
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) {
      cached = existing;
      return cached;
    }
  } catch {
    /* private mode with storage disabled — fall through */
  }
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* keep it in memory only */
  }
  cached = id;
  return id;
}

/** A user and the device they are on. LiveKit allows the same user twice under
 *  two of these; the bare user id would make the second one kick the first. */
export function encodeIdentity(userId: string, device: string): string {
  return `${userId}:${device}`;
}

export function localIdentity(userId: string): string {
  return encodeIdentity(userId, deviceId());
}

/** The user behind an identity, of this device or another. */
export function identityUser(identity: string): string {
  const at = identity.indexOf(':');
  return at === -1 ? identity : identity.slice(0, at);
}

/** A device's signalled media state, as the server relays it. */
export interface MediaState {
  mic: boolean;
  cam: boolean;
  screen: boolean;
}

/**
 * One user's media state across all of their devices. The server keys state per
 * device, so a person in a call from two places has two entries; "are we hearing
 * them" is true when ANY of their devices is unmuted, and likewise for camera
 * and screen share. Returns undefined when none of their devices is in the call.
 */
export function mediaForUser(
  states: Record<string, MediaState> | undefined,
  userId: string,
): MediaState | undefined {
  if (!states) return undefined;
  let found: MediaState | undefined;
  for (const [identity, state] of Object.entries(states)) {
    if (identityUser(identity) !== userId) continue;
    found = {
      mic: (found?.mic ?? false) || state.mic,
      cam: (found?.cam ?? false) || state.cam,
      screen: (found?.screen ?? false) || state.screen,
    };
  }
  return found;
}
