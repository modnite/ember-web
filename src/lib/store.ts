import { create } from 'zustand';
import { api, ApiError, onAuthLost } from './api';
import { decryptBody } from './decrypt';
import { encodeEnvelope, encryptWithRoomKey, roomKeyFromGroup, sealBytes } from './crypto';
import { ensureGroupKey, forgetDevice, loadOrCreateDevice, type GroupState } from './group';
import { desktopAttention, desktopNotify, desktopUnread, isSoloWindow } from './desktop';
import { lastActivity, messagePreview } from './format';
import { realtime, type Frame } from './realtime';
import { playSound } from './sounds';
import { noteReaction } from './emojiUse';
import { preparePhoto } from './photo';
import { usePrefs } from './prefs';
import type { ActiveCall, AuthConfig, Contacts, IncomingRing, Message, Room, ServerInfo, User } from './types';

export type Boot = 'loading' | 'signedOut' | 'ready';
export type E2eeStatus = 'unknown' | 'none' | 'waiting' | 'ready';

export interface PendingMessage {
  /** The temporary id the message has in the list until the server answers. */
  id: string;
  state: 'sending' | 'failed';
  text: string;
  replyTo?: string;
  files?: File[];
}

interface State {
  boot: Boot;
  me: User | null;
  info: ServerInfo | null;
  authConfig: AuthConfig | null;
  connected: boolean;
  online: boolean;

  rooms: Room[];
  users: Record<string, User>;
  contacts: Contacts;
  messages: Record<string, Message[]>;
  /** loading: first page on its way; more: older messages exist; done: that is everything. */
  history: Record<string, 'loading' | 'more' | 'done'>;
  pending: Record<string, PendingMessage>;
  typing: Record<string, Record<string, number>>;
  events: Record<string, { id: string; text: string; at: number }[]>;
  /** When the last nudge arrived in each room, so the open chat can shake. */
  nudgeAt: Record<string, number>;
  activeCalls: Record<string, ActiveCall>;
  ring: IncomingRing | null;
  activeRoomId: string | null;
  replyTo: Record<string, Message | null>;
  editing: Message | null;

  e2ee: { status: E2eeStatus; key: Uint8Array | null; kid: string | null; busy: boolean };
  toast: { id: number; text: string } | null;

  init: () => Promise<void>;
  signIn: (username: string, password: string, code?: string) => Promise<void>;
  register: (invite: string, username: string, displayName: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  showToast: (text: string) => void;

  loadRooms: () => Promise<void>;
  loadContacts: () => Promise<void>;
  openRoom: (id: string | null) => Promise<void>;
  loadOlder: (roomId: string) => Promise<void>;
  sendNudge: (roomId: string) => void;
  /** A message to scroll to once its chat is open (from a search result). */
  pendingJump: { roomId: string; id: string } | null;
  setJump: (j: { roomId: string; id: string } | null) => void;
  openDm: (userId: string) => Promise<string>;
  createGroup: (name: string, memberIds: string[], encrypted: boolean) => Promise<string>;
  renameRoom: (id: string, name: string) => Promise<void>;
  addMembers: (id: string, userIds: string[]) => Promise<void>;
  removeMember: (id: string, userId: string) => Promise<void>;
  leaveRoom: (id: string) => Promise<void>;
  archiveRoom: (id: string, archived: boolean) => Promise<void>;
  setRoomAvatar: (id: string, file: Blob | null) => Promise<void>;

  send: (roomId: string, text: string) => Promise<void>;
  sendFiles: (roomId: string, files: File[], caption?: string) => Promise<void>;
  retry: (roomId: string, tmpId: string) => Promise<void>;
  discard: (roomId: string, tmpId: string) => void;
  edit: (message: Message, text: string) => Promise<void>;
  remove: (message: Message) => Promise<void>;
  react: (message: Message, emoji: string) => Promise<void>;
  pin: (message: Message) => Promise<void>;
  forward: (message: Message, roomId: string) => Promise<void>;
  setReply: (roomId: string, m: Message | null) => void;
  setEditing: (m: Message | null) => void;
  typingNow: (roomId: string) => void;

  addContact: (who: string) => Promise<void>;
  acceptContact: (id: string) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
  updateProfile: (p: { displayName?: string; statusMessage?: string }) => Promise<void>;
  setAvatar: (file: Blob | null) => Promise<void>;

  setupE2ee: (createIfMissing: boolean) => Promise<void>;
  /** The readable text of a message body (decrypted when it is sealed and the key is here). */
  text: (m: Pick<Message, 'roomId' | 'body'>) => { text: string; locked: boolean; failed: boolean };
}

let toastId = 0;
let lastNudge = 0;
let tmpCounter = 0;
const TYPING_MS = 5000;
const lastTypingSent: Record<string, number> = {};

const sortRooms = (rooms: Room[]): Room[] => [...rooms].sort((a, b) => lastActivity(b) - lastActivity(a));

function upsertRoom(rooms: Room[], room: Room): Room[] {
  const i = rooms.findIndex((r) => r.id === room.id);
  if (i < 0) return sortRooms([...rooms, room]);
  const next = [...rooms];
  next[i] = room;
  return sortRooms(next);
}

function mergeUsers(users: Record<string, User>, list: User[]): Record<string, User> {
  const out = { ...users };
  for (const u of list) out[u.id] = { ...out[u.id], ...u };
  return out;
}

function upsertMessage(list: Message[], m: Message): Message[] {
  const i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) {
    const next = [...list];
    next[i] = m;
    return next;
  }
  return [...list, m].sort((a, b) => a.createdAt - b.createdAt);
}

const errorText = (e: unknown): string => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.');

export const useStore = create<State>((set, get) => {
  const visible = (): boolean => document.visibilityState === 'visible';

  function setBadge(rooms: Room[]): void {
    const n = rooms.filter((r) => !r.archived).reduce((sum, r) => sum + r.unread, 0);
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if (n > 0) void nav.setAppBadge?.(n);
      else void nav.clearAppBadge?.();
    } catch {
      /* no badge on this browser */
    }
    document.title = n > 0 ? `(${n}) Ember` : 'Ember';
    desktopUnread(n);
  }

  function handleFrame(f: Frame): void {
    const s = get();
    switch (f.t) {
      case 'ready':
        // After every (re)connect: whatever happened while we were away.
        void s.loadRooms();
        if (s.activeRoomId) void refreshActive(s.activeRoomId);
        break;
      case 'message': {
        const m = f.message as Message;
        const mine = m.userId === s.me?.id;
        const viewing = s.activeRoomId === m.roomId && visible();
        set((st) => {
          const loaded = st.messages[m.roomId];
          const rooms = st.rooms.map((r) => (r.id === m.roomId ? { ...r, lastMessage: m, unread: mine || viewing ? r.unread : r.unread + 1 } : r));
          const next: Partial<State> = { rooms: sortRooms(rooms), users: m.user ? mergeUsers(st.users, [m.user]) : st.users };
          if (loaded) next.messages = { ...st.messages, [m.roomId]: upsertMessage(loaded, m) };
          const typing = st.typing[m.roomId];
          if (typing && typing[m.userId]) next.typing = { ...st.typing, [m.roomId]: { ...typing, [m.userId]: 0 } };
          return next;
        });
        setBadge(get().rooms);
        if (!mine) {
          if (viewing) void api.markRead(m.roomId).catch(() => undefined);
          else {
            // A chat window of the desktop app stays quiet for what arrives: the main window already plays it.
            if (usePrefs.getState().sounds && !isSoloWindow()) playSound('message');
            // The desktop app: a system notice and a flashing taskbar button (the app itself stays quiet when its window is the one in use).
            const dec = get().text(m);
            const body = dec.locked ? 'Sealed message' : dec.failed ? 'Could not read this message' : dec.text;
            desktopNotify(m.user?.displayName ?? 'Ember', messagePreview(m, body));
            desktopAttention(false);
          }
        }
        break;
      }
      case 'message.updated': {
        const m = f.message as Message;
        set((st) => ({
          messages: st.messages[m.roomId] ? { ...st.messages, [m.roomId]: upsertMessage(st.messages[m.roomId]!, m) } : st.messages,
          rooms: st.rooms.map((r) => (r.id === m.roomId && r.lastMessage?.id === m.id ? { ...r, lastMessage: m } : r)),
        }));
        break;
      }
      case 'message.deleted': {
        const roomId = String(f.roomId);
        const id = String(f.id);
        set((st) => ({
          messages: st.messages[roomId]
            ? { ...st.messages, [roomId]: st.messages[roomId]!.map((m) => (m.id === id ? { ...m, deletedAt: Date.now(), body: '', attachments: [] } : m)) }
            : st.messages,
          rooms: st.rooms.map((r) => (r.id === roomId && r.lastMessage?.id === id ? { ...r, lastMessage: { ...r.lastMessage, deletedAt: Date.now(), body: '', attachments: [] } } : r)),
        }));
        break;
      }
      case 'pins': {
        const roomId = String(f.roomId);
        set((st) => ({ rooms: st.rooms.map((r) => (r.id === roomId ? { ...r, pinned: f.pinned as Message[] } : r)) }));
        break;
      }
      case 'read': {
        const roomId = String(f.roomId);
        const userId = String(f.userId);
        const at = Number(f.at);
        set((st) => ({
          rooms: st.rooms.map((r) => {
            if (r.id !== roomId) return r;
            const reads = [...(r.reads ?? []).filter((x) => x.userId !== userId), { userId, lastReadAt: at }];
            return { ...r, reads, unread: userId === st.me?.id ? 0 : r.unread };
          }),
        }));
        if (userId === s.me?.id) setBadge(get().rooms);
        break;
      }
      case 'typing': {
        const roomId = String(f.roomId);
        const userId = String(f.userId);
        set((st) => ({ typing: { ...st.typing, [roomId]: { ...st.typing[roomId], [userId]: f.typing ? Date.now() + TYPING_MS : 0 } } }));
        break;
      }
      case 'presence':
        set((st) => ({ users: mergeUsers(st.users, [f.user as User]), rooms: st.rooms.map((r) => ({ ...r, members: r.members.map((m) => (m.id === (f.user as User).id ? { ...m, ...(f.user as User) } : m)) })) }));
        break;
      case 'room.updated': {
        const room = f.room as Room;
        set((st) => ({ rooms: upsertRoom(st.rooms, room), users: mergeUsers(st.users, room.members) }));
        setBadge(get().rooms);
        break;
      }
      case 'room.removed': {
        const roomId = String(f.roomId);
        set((st) => {
          const { [roomId]: _m, ...messages } = st.messages;
          void _m;
          return { rooms: st.rooms.filter((r) => r.id !== roomId), messages };
        });
        if (s.activeRoomId === roomId) location.hash = '#/';
        break;
      }
      case 'room.event': {
        const roomId = String(f.roomId);
        set((st) => ({ events: { ...st.events, [roomId]: [...(st.events[roomId] ?? []), { id: `ev${++tmpCounter}`, text: String(f.text ?? ''), at: Date.now() }].slice(-30) } }));
        break;
      }
      case 'nudge': {
        const roomId = String(f.roomId);
        const userId = String(f.userId);
        if (userId === s.me?.id) break;
        const name = get().users[userId]?.displayName ?? 'Someone';
        set((st) => ({ nudgeAt: { ...st.nudgeAt, [roomId]: Date.now() }, events: { ...st.events, [roomId]: [...(st.events[roomId] ?? []), { id: `ev${++tmpCounter}`, text: `${name} sent a nudge`, at: Date.now() }].slice(-30) } }));
        if (!isSoloWindow()) playSound('nudge');
        desktopNotify(`${name} sent a nudge`, 'Open Ember to answer.');
        desktopAttention(true);
        navigator.vibrate?.([120, 60, 120, 60, 200]);
        break;
      }
      case 'contacts.changed':
        void s.loadContacts();
        break;
      case 'call.active': {
        const call = f as unknown as ActiveCall & { t: string };
        set((st) => ({ activeCalls: { ...st.activeCalls, [call.roomId]: call } }));
        break;
      }
      case 'call.end': {
        const roomId = String(f.roomId);
        set((st) => {
          const { [roomId]: _c, ...rest } = st.activeCalls;
          void _c;
          return { activeCalls: rest, ring: st.ring?.roomId === roomId ? null : st.ring };
        });
        break;
      }
      case 'call.ring':
        desktopNotify(`${String(f.fromName)} is calling`, 'Open Ember to answer.');
        desktopAttention(true);
        set({ ring: { roomId: String(f.roomId), fromUserId: String(f.fromUserId), fromName: String(f.fromName), startedAt: Number(f.startedAt) } });
        break;
      case 'call.ring.stop':
        set((st) => (st.ring?.roomId === String(f.roomId) ? { ring: null } : st));
        break;
      default:
        break;
    }
  }

  async function refreshActive(roomId: string): Promise<void> {
    try {
      const { messages } = await api.messages(roomId);
      set((st) => {
        const existing = st.messages[roomId] ?? [];
        const merged = messages.reduce(upsertMessage, existing.filter((m) => !m.id.startsWith('tmp:')));
        return { messages: { ...st.messages, [roomId]: merged }, history: { ...st.history, [roomId]: st.history[roomId] === 'done' ? 'done' : messages.length >= 50 ? 'more' : 'done' } };
      });
    } catch {
      /* the next reconnect tries again */
    }
  }

  function tmpMessage(roomId: string, text: string, replyTo?: Message | null): Message {
    return {
      id: `tmp:${++tmpCounter}:${Date.now()}`,
      roomId,
      userId: get().me!.id,
      body: text,
      createdAt: Date.now(),
      attachments: [],
      reactions: [],
      replyTo: replyTo ? { id: replyTo.id, userId: replyTo.userId, body: replyTo.body } : null,
    };
  }

  /** The sealed form of a message body for this room, or an error sentence when the room is encrypted and the key is not here yet. */
  function seal(room: Room | undefined, text: string): string {
    if (!room?.encrypted) return text;
    const { key, kid } = get().e2ee;
    if (!key || !kid) throw new Error('Set up encryption in this browser first (the banner above the message box).');
    return encryptWithRoomKey(roomKeyFromGroup(key, room.id, 'chat'), kid, text);
  }

  async function deliver(roomId: string, tmp: Message, text: string, replyId?: string): Promise<void> {
    const room = get().rooms.find((r) => r.id === roomId);
    set((st) => ({ pending: { ...st.pending, [tmp.id]: { id: tmp.id, state: 'sending', text, replyTo: replyId } } }));
    try {
      const body = seal(room, text);
      const { message } = await api.sendMessage(roomId, body, replyId);
      set((st) => {
        const { [tmp.id]: _p, ...pending } = st.pending;
        void _p;
        const list = (st.messages[roomId] ?? []).filter((m) => m.id !== tmp.id);
        return {
          pending,
          messages: { ...st.messages, [roomId]: upsertMessage(list, message) },
          rooms: sortRooms(st.rooms.map((r) => (r.id === roomId ? { ...r, lastMessage: message } : r))),
        };
      });
    } catch (e) {
      set((st) => ({ pending: { ...st.pending, [tmp.id]: { id: tmp.id, state: 'failed', text, replyTo: replyId } } }));
      get().showToast(errorText(e));
    }
  }

  return {
    boot: 'loading',
    me: null,
    info: null,
    authConfig: null,
    connected: false,
    online: navigator.onLine,
    rooms: [],
    users: {},
    contacts: { contacts: [], incoming: [], outgoing: [] },
    messages: {},
    history: {},
    pending: {},
    typing: {},
    events: {},
    nudgeAt: {},
    pendingJump: null,
    setJump: (pendingJump) => set({ pendingJump }),
    activeCalls: {},
    ring: null,
    activeRoomId: null,
    replyTo: {},
    editing: null,
    e2ee: { status: 'unknown', key: null, kid: null, busy: false },
    toast: null,

    async init() {
      onAuthLost(() => {
        realtime.stop();
        set({ boot: 'signedOut', me: null });
      });
      realtime.on(handleFrame);
      realtime.onState((connected) => set({ connected }));
      window.addEventListener('online', () => set({ online: true }));
      window.addEventListener('offline', () => set({ online: false }));
      const [info, authConfig] = await Promise.all([api.info().catch(() => null), api.authConfig().catch(() => null)]);
      set({ info, authConfig });
      try {
        const { user } = await api.me();
        set({ me: user, boot: 'ready' });
        await afterSignIn();
      } catch {
        set({ boot: 'signedOut' });
      }
    },

    async signIn(username, password, code) {
      const { user } = await api.login(username.trim(), password, code);
      await keptSession();
      set({ me: user, boot: 'ready' });
      await afterSignIn();
    },

    async register(invite, username, displayName, password) {
      const { user } = await api.register(invite.trim(), username.trim(), displayName.trim(), password);
      await keptSession();
      set({ me: user, boot: 'ready' });
      await afterSignIn();
    },

    async signOut() {
      try {
        await api.logout();
      } catch {
        /* signed out here either way */
      }
      realtime.stop();
      forgetDevice();
      set({ boot: 'signedOut', me: null, rooms: [], messages: {}, history: {}, pending: {}, contacts: { contacts: [], incoming: [], outgoing: [] }, users: {}, activeRoomId: null, e2ee: { status: 'unknown', key: null, kid: null, busy: false } });
      setBadge([]);
    },

    showToast(text) {
      const id = ++toastId;
      set({ toast: { id, text } });
      window.setTimeout(() => set((st) => (st.toast?.id === id ? { toast: null } : st)), 4500);
    },

    async loadRooms() {
      try {
        const { rooms } = await api.rooms();
        set((st) => ({ rooms: sortRooms(rooms), users: mergeUsers(st.users, rooms.flatMap((r) => r.members)) }));
        setBadge(rooms);
      } catch {
        /* offline: keep what is shown */
      }
    },

    async loadContacts() {
      try {
        const [contacts, { users }] = await Promise.all([api.contacts(), api.users()]);
        set((st) => ({ contacts, users: mergeUsers(st.users, [...users, ...contacts.incoming, ...contacts.outgoing]) }));
      } catch {
        /* offline */
      }
    },

    async openRoom(id) {
      set({ activeRoomId: id, editing: null });
      if (!id) return;
      const st = get();
      if (!st.messages[id]) {
        set((s) => ({ history: { ...s.history, [id]: 'loading' } }));
        await refreshActive(id);
      } else void refreshActive(id);
      const room = get().rooms.find((r) => r.id === id);
      if (room && room.unread > 0) {
        set((s) => ({ rooms: s.rooms.map((r) => (r.id === id ? { ...r, unread: 0 } : r)) }));
        setBadge(get().rooms);
      }
      void api.markRead(id).catch(() => undefined);
    },

    async loadOlder(roomId) {
      const list = get().messages[roomId];
      if (!list?.length || get().history[roomId] !== 'more') return;
      const oldest = list.find((m) => !m.id.startsWith('tmp:'));
      if (!oldest) return;
      set((s) => ({ history: { ...s.history, [roomId]: 'loading' } }));
      try {
        const { messages } = await api.messages(roomId, oldest.createdAt);
        set((st) => ({
          messages: { ...st.messages, [roomId]: messages.reduce(upsertMessage, st.messages[roomId] ?? []) },
          history: { ...st.history, [roomId]: messages.length >= 50 ? 'more' : 'done' },
        }));
      } catch {
        set((s) => ({ history: { ...s.history, [roomId]: 'more' } }));
      }
    },

    async openDm(userId) {
      const { room } = await api.openDm(userId);
      set((st) => ({ rooms: upsertRoom(st.rooms, room), users: mergeUsers(st.users, room.members) }));
      return room.id;
    },

    async createGroup(name, memberIds, encrypted) {
      const { room } = await api.createRoom(name.trim(), memberIds, encrypted);
      set((st) => ({ rooms: upsertRoom(st.rooms, room), users: mergeUsers(st.users, room.members) }));
      return room.id;
    },

    async renameRoom(id, name) {
      const { room } = await api.renameRoom(id, name.trim());
      set((st) => ({ rooms: upsertRoom(st.rooms, room) }));
    },

    async addMembers(id, userIds) {
      const { room, skipped } = await api.addMembers(id, userIds);
      set((st) => ({ rooms: upsertRoom(st.rooms, room), users: mergeUsers(st.users, room.members) }));
      if (skipped.length) get().showToast(`${skipped.length} could not be added.`);
    },

    async removeMember(id, userId) {
      const { room } = await api.removeMember(id, userId);
      set((st) => ({ rooms: upsertRoom(st.rooms, room) }));
    },

    async leaveRoom(id) {
      await api.leaveRoom(id);
      set((st) => ({ rooms: st.rooms.filter((r) => r.id !== id) }));
    },

    async archiveRoom(id, archived) {
      const { room } = await api.archiveRoom(id, archived);
      set((st) => ({ rooms: upsertRoom(st.rooms, room) }));
      setBadge(get().rooms);
    },

    async setRoomAvatar(id, file) {
      const { room } = file ? await api.uploadRoomAvatar(id, file) : await api.removeRoomAvatar(id);
      set((st) => ({ rooms: upsertRoom(st.rooms, room) }));
    },

    async send(roomId, text) {
      const body = text.trim();
      if (!body) return;
      const reply = get().replyTo[roomId] ?? null;
      const tmp = tmpMessage(roomId, body, reply);
      set((st) => ({ messages: { ...st.messages, [roomId]: [...(st.messages[roomId] ?? []), tmp] }, replyTo: { ...st.replyTo, [roomId]: null } }));
      await deliver(roomId, tmp, body, reply?.id);
    },

    async sendFiles(roomId, files, caption = '') {
      const room = get().rooms.find((r) => r.id === roomId);
      let first = true;
      for (const original of files) {
        try {
          const file = await preparePhoto(original, usePrefs.getState().sendHd ? 'hd' : 'standard');
          const body = first ? caption : '';
          let payload: { blob: Blob; filename: string; encrypted?: boolean; envelope?: string } = { blob: file, filename: file.name || 'file' };
          if (room?.encrypted) {
            const { key, kid } = get().e2ee;
            if (!key || !kid) throw new Error('Set up encryption in this browser first.');
            const bytes = new Uint8Array(await file.arrayBuffer());
            const sealed = sealBytes(roomKeyFromGroup(key, roomId, 'file'), kid, bytes, file.type);
            payload = { blob: new Blob([sealed.data as BlobPart], { type: 'application/octet-stream' }), filename: file.name || 'file', encrypted: true, envelope: encodeEnvelope(sealed.envelope) };
          }
          const { message } = await api.upload(roomId, payload, body ? seal(room, body) : '');
          set((st) => ({
            messages: { ...st.messages, [roomId]: upsertMessage(st.messages[roomId] ?? [], message) },
            rooms: sortRooms(st.rooms.map((r) => (r.id === roomId ? { ...r, lastMessage: message } : r))),
          }));
        } catch (e) {
          get().showToast(errorText(e));
          break;
        }
        first = false;
      }
    },

    sendNudge(roomId) {
      // As often as you like, as in the Android app: the chat shakes, the phone buzzes and the sound plays every time. Only a double tap
      // inside a quarter of a second counts once.
      const now = Date.now();
      if (now - lastNudge < 250) return;
      lastNudge = now;
      realtime.send({ t: 'nudge', roomId });
      playSound('nudge');
      navigator.vibrate?.([120, 60, 120]);
      set((st) => ({ nudgeAt: { ...st.nudgeAt, [roomId]: now }, events: { ...st.events, [roomId]: [...(st.events[roomId] ?? []), { id: `ev${++tmpCounter}`, text: 'You sent a nudge', at: now }].slice(-30) } }));
    },

    async retry(roomId, tmpId) {
      const p = get().pending[tmpId];
      const tmp = get().messages[roomId]?.find((m) => m.id === tmpId);
      if (!p || !tmp) return;
      await deliver(roomId, tmp, p.text, p.replyTo);
    },

    discard(roomId, tmpId) {
      set((st) => {
        const { [tmpId]: _p, ...pending } = st.pending;
        void _p;
        return { pending, messages: { ...st.messages, [roomId]: (st.messages[roomId] ?? []).filter((m) => m.id !== tmpId) } };
      });
    },

    async edit(message, text) {
      const room = get().rooms.find((r) => r.id === message.roomId);
      try {
        const { message: m } = await api.editMessage(message.id, seal(room, text.trim()));
        set((st) => ({ editing: null, messages: { ...st.messages, [m.roomId]: upsertMessage(st.messages[m.roomId] ?? [], m) } }));
      } catch (e) {
        get().showToast(errorText(e));
      }
    },

    async remove(message) {
      try {
        await api.deleteMessage(message.id);
      } catch (e) {
        get().showToast(errorText(e));
      }
    },

    async react(message, emoji) {
      noteReaction(emoji);
      try {
        const { message: m } = await api.react(message.id, emoji);
        set((st) => ({ messages: { ...st.messages, [m.roomId]: upsertMessage(st.messages[m.roomId] ?? [], m) } }));
      } catch (e) {
        get().showToast(errorText(e));
      }
    },

    async pin(message) {
      try {
        await api.pin(message.id);
      } catch (e) {
        get().showToast(errorText(e));
      }
    },

    async forward(message, roomId) {
      try {
        const { message: m } = await api.forward(message.id, roomId);
        set((st) => ({ messages: st.messages[roomId] ? { ...st.messages, [roomId]: upsertMessage(st.messages[roomId]!, m) } : st.messages, rooms: sortRooms(st.rooms.map((r) => (r.id === roomId ? { ...r, lastMessage: m } : r))) }));
        get().showToast('Forwarded');
      } catch (e) {
        get().showToast(errorText(e));
      }
    },

    setReply(roomId, m) {
      set((st) => ({ replyTo: { ...st.replyTo, [roomId]: m }, editing: null }));
    },

    setEditing(m) {
      set({ editing: m });
    },

    typingNow(roomId) {
      const now = Date.now();
      if (now - (lastTypingSent[roomId] ?? 0) < 3000) return;
      lastTypingSent[roomId] = now;
      realtime.send({ t: 'typing', roomId, typing: true });
    },

    async addContact(who) {
      await api.addContact(who.trim().replace(/^@/, ''));
      await get().loadContacts();
    },

    async acceptContact(id) {
      await api.acceptContact(id);
      await get().loadContacts();
    },

    async removeContact(id) {
      await api.removeContact(id);
      await get().loadContacts();
    },

    async updateProfile(p) {
      const { user } = await api.updateMe(p);
      set((st) => ({ me: user, users: mergeUsers(st.users, [user]) }));
    },

    async setAvatar(file) {
      const { user } = file ? await api.uploadAvatar(file) : await api.removeAvatar();
      set((st) => ({ me: user, users: mergeUsers(st.users, [user]) }));
    },

    async setupE2ee(createIfMissing) {
      set((st) => ({ e2ee: { ...st.e2ee, busy: true } }));
      try {
        const g: GroupState = await ensureGroupKey(loadOrCreateDevice(), { createIfMissing });
        set({ e2ee: { status: g.status === 'ready' ? 'ready' : g.status === 'waiting' ? 'waiting' : 'none', key: g.key, kid: g.kid, busy: false } });
      } catch (e) {
        set((st) => ({ e2ee: { ...st.e2ee, busy: false } }));
        get().showToast(errorText(e));
      }
    },

    text(m) {
      const { key } = get().e2ee;
      return decryptBody(m.roomId, m.body, key, null);
    },
  };

  /**
   * Right after signing in, ask who we are. If the server does not know, the browser did not keep the session cookie (Safari's "Block All
   * Cookies", a private tab, an in-app browser), and "unauthorized" would be all the person ever saw. Say what to change instead.
   */
  async function keptSession(): Promise<void> {
    // An installed iPhone app can take a moment to hand a new cookie to its network requests, so the first asks may not carry it yet.
    for (const wait of [0, 400, 1200]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        await api.me();
        return;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
      }
    }
    throw new ApiError(401, 'You signed in, but this browser did not keep the sign-in. Allow cookies for this site. On iPhone: Settings, Apps, Safari, turn off Block All Cookies, and use a normal tab, not a private one or the browser built into another app.');
  }

  async function afterSignIn(): Promise<void> {
    realtime.start();
    await Promise.all([get().loadRooms(), get().loadContacts()]);
    // Join the encryption key if this account already has one (another device or phone hands it over).
    void get().setupE2ee(false);
  }
});
