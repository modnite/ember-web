import { deviceId } from './device';
import type {
  AuthConfig, CallToken, Contacts, E2eeDevice, E2eeWrap, FriendCode, LinkPreview, LookupResult, Message, Room, RoomMediaItem, SearchResult, ServerInfo,
  TwoStepStatus, User,
} from './types';

export type { E2eeWrap } from './types';

/** The server said no, or could not be reached. The message is meant to be shown to a person. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: Record<string, unknown>) {
    super(message);
  }
}

let authLost: (() => void) | null = null;
/** Called when a request that needs a session comes back 401, so the app can return to the sign-in screen. */
export function onAuthLost(fn: () => void): void {
  authLost = fn;
}

function friendly(e: unknown): string {
  if (e instanceof TypeError) return 'Cannot reach the server. Check your connection.';
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: 'include' });
  } catch (e) {
    throw new ApiError(0, friendly(e));
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* not JSON: the status text is used */
  }
  if (!res.ok) {
    // 401 on a sign-in attempt is a wrong password, not a lost session.
    if (res.status === 401 && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/register')) authLost?.();
    throw new ApiError(res.status, typeof data.error === 'string' ? data.error : `Something went wrong (${res.status}).`, data);
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body ?? {}) });
const patch = (body: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(body) });
const del = (): RequestInit => ({ method: 'DELETE' });
const q = encodeURIComponent;

export const api = {
  // ---- the server and the account
  info: () => req<ServerInfo>('/api/server/info'),
  authConfig: () => req<AuthConfig>('/api/auth/config'),
  me: () => req<{ user: User; admin?: boolean }>('/api/auth/me'),
  login: (username: string, password: string, code?: string) =>
    req<{ user: User }>('/api/auth/login', json(code ? { username, password, code } : { username, password })),
  register: (invite: string, username: string, displayName: string, password: string) =>
    req<{ user: User }>('/api/auth/register', json({ invite, username, displayName, password })),
  logout: () => req<{ ok: true }>('/api/auth/logout', json({})),
  updateMe: (p: Partial<Pick<User, 'displayName' | 'statusMessage'>>) => req<{ user: User }>('/api/auth/me', patch(p)),
  uploadAvatar: (file: Blob) => {
    const body = new FormData();
    body.append('file', file, 'avatar');
    return req<{ user: User }>('/api/auth/avatar', { method: 'POST', body });
  },
  removeAvatar: () => req<{ user: User }>('/api/auth/avatar', del()),
  changeUsername: (username: string, password: string) => req<{ user: User }>('/api/auth/username', json({ username, password })),
  changePassword: (current: string, next: string) => req<{ ok: true }>('/api/auth/change-password', json({ current, next })),
  twoStep: () => req<TwoStepStatus>('/api/auth/2fa'),
  twoStepSetup: () => req<{ secret: string; uri: string }>('/api/auth/2fa/setup', json({})),
  twoStepEnable: (code: string) => req<{ recovery: string[] }>('/api/auth/2fa/enable', json({ code })),
  twoStepDisable: (password: string, code: string) => req<{ ok: true }>('/api/auth/2fa/disable', json({ password, code })),

  // ---- people
  users: () => req<{ users: User[] }>('/api/users'),
  contacts: () => req<Contacts>('/api/contacts'),
  addContact: (who: string | { code: string }) => req<{ ok: true }>('/api/contacts', json(typeof who === 'string' ? { username: who } : who)),
  acceptContact: (id: string) => req<{ ok: true }>(`/api/contacts/${id}/accept`, json({})),
  removeContact: (id: string) => req<{ ok: true }>(`/api/contacts/${id}`, del()),
  lookup: (query: string) => req<LookupResult>(`/api/users/lookup?q=${q(query)}`),
  friendCode: () => req<FriendCode>('/api/friend-code'),
  newFriendCode: () => req<FriendCode>('/api/friend-code', json({})),
  blocks: () => req<{ blocked: User[] }>('/api/blocks'),
  block: (userId: string) => req<{ ok: true }>('/api/blocks', json({ userId })),
  unblock: (userId: string) => req<{ ok: true }>(`/api/blocks/${userId}`, del()),

  // ---- chats
  rooms: () => req<{ rooms: Room[] }>('/api/rooms'),
  openDm: (userId: string) => req<{ room: Room }>(`/api/users/${userId}/dm`, json({})),
  createRoom: (name: string, memberIds: string[], encrypted = false, topic = '') => req<{ room: Room }>('/api/rooms', json({ name, memberIds, encrypted, topic })),
  renameRoom: (id: string, name: string) => req<{ room: Room }>(`/api/rooms/${id}`, patch({ name })),
  setEncrypted: (id: string, encrypted: boolean) => req<{ room: Room }>(`/api/rooms/${id}`, patch({ encrypted })),
  addMembers: (id: string, userIds: string[]) =>
    req<{ room: Room; added: string[]; skipped: { id: string; reason: string }[] }>(`/api/rooms/${id}/members`, json({ userIds })),
  removeMember: (id: string, userId: string) => req<{ room: Room }>(`/api/rooms/${id}/members/${userId}`, del()),
  leaveRoom: (id: string) => req<{ ok: true }>(`/api/rooms/${id}/leave`, json({})),
  archiveRoom: (id: string, archived: boolean) => req<{ room: Room }>(`/api/rooms/${id}/archive`, json({ archived })),
  uploadRoomAvatar: (id: string, file: Blob) => {
    const body = new FormData();
    body.append('file', file, 'group');
    return req<{ room: Room }>(`/api/rooms/${id}/avatar`, { method: 'POST', body });
  },
  removeRoomAvatar: (id: string) => req<{ room: Room }>(`/api/rooms/${id}/avatar`, del()),
  /** Everything shared in a room, newest first, a page at a time. */
  roomMedia: (id: string, before?: number) => req<{ media: RoomMediaItem[] }>(`/api/rooms/${id}/media${before ? `?before=${before}` : ''}`),
  markRead: (id: string) => req<{ ok: true }>(`/api/rooms/${id}/read`, json({})),

  // ---- messages
  messages: (roomId: string, before?: number) => req<{ messages: Message[] }>(`/api/rooms/${roomId}/messages${before ? `?before=${before}` : ''}`),
  sendMessage: (roomId: string, body: string, replyTo?: string) => req<{ message: Message }>(`/api/rooms/${roomId}/messages`, json({ body, ...(replyTo ? { replyTo } : {}) })),
  editMessage: (id: string, body: string) => req<{ message: Message }>(`/api/messages/${id}`, patch({ body })),
  deleteMessage: (id: string) => req<{ ok: true }>(`/api/messages/${id}`, del()),
  react: (id: string, emoji: string) => req<{ message: Message }>(`/api/messages/${id}/reactions`, json({ emoji })),
  pin: (id: string) => req<{ ok: true }>(`/api/messages/${id}/pin`, json({})),
  forward: (id: string, roomId: string) => req<{ message: Message }>(`/api/messages/${id}/forward`, json({ roomId })),
  search: (query: string) => req<{ results: SearchResult[] }>(`/api/search?q=${q(query)}`),
  preview: (url: string) => req<{ preview: LinkPreview | null }>('/api/preview', json({ url })),
  upload: (roomId: string, file: { blob: Blob; filename: string; encrypted?: boolean; envelope?: string }, body = '') => {
    const form = new FormData();
    form.append('file', file.blob, file.filename);
    if (body) form.append('body', body);
    if (file.encrypted) {
      form.append('encrypted', '1');
      form.append('envelope', file.envelope ?? '');
    }
    return req<{ message: Message }>(`/api/rooms/${roomId}/attachments`, { method: 'POST', body: form });
  },

  // ---- calls
  callToken: (roomId: string) => req<CallToken>(`/api/rooms/${roomId}/call/token`, json({ device: deviceId() })),

  // ---- end-to-end encryption
  e2eeRegisterDevice: (device: string, publicKey: string) => req<{ wraps: E2eeWrap[]; hasGroupKey: boolean }>('/api/e2ee/device', json({ deviceId: device, publicKey })),
  e2eeWraps: (device: string) => req<{ wraps: E2eeWrap[] }>(`/api/e2ee/wraps?deviceId=${q(device)}`),
  e2eeDevices: () => req<{ devices: E2eeDevice[] }>('/api/e2ee/devices'),
  e2eeWrap: (input: { senderDevice: string; recipientDevice: string; keyId: string; wrapped: { v: number; eph: string; n: string; ct: string } }) =>
    req<{ ok: true }>('/api/e2ee/wrap', json(input)),

  // ---- push
  pushKey: () => req<{ enabled: boolean; key: string }>('/api/push/key'),
  pushSubscribe: (subscription: PushSubscriptionJSON) => req<{ ok: true }>('/api/push/subscribe', json({ subscription })),
  pushUnsubscribe: (endpoint: string) => req<{ ok: true }>('/api/push/unsubscribe', json({ endpoint })),
  pushTest: () => req<{ sent: number; failed: number; pruned: number; error?: string }>('/api/push/test', json({})),

  // ---- crash reports
  crashReport: (body: Record<string, unknown>) => req<{ ok: true }>('/api/crash-reports', json(body)),
};

/** The URL of a picture on the server (avatars, attachments): same origin, so the session cookie goes with it. */
export const fileUrl = (path?: string | null): string | undefined => (path ? path : undefined);
export const attachmentUrl = (id: string): string => `/api/attachments/${id}`;
