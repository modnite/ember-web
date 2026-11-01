/** What the Hearth server sends, as Ember (Android) models it. */

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatar?: string | null;
  wallpaper?: string | null;
  status: 'online' | 'away' | 'busy' | 'invisible' | 'offline' | string;
  statusMessage: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
  /** 1 when the file is sealed with the end-to-end key. */
  encrypted?: number;
  envelope?: string;
}

/** One file shared in a room, from the room's media list. */
export interface RoomMediaItem extends Attachment {
  createdAt: number;
  messageId: string;
  userId: string;
}

export interface Reaction {
  user_id: string;
  emoji: string;
}

export interface MessageQuote {
  id: string;
  userId: string;
  body: string;
  deleted?: boolean;
}

export interface Message {
  id: string;
  roomId: string;
  userId: string;
  body: string;
  createdAt: number;
  editedAt?: number | null;
  deletedAt?: number | null;
  replyTo?: MessageQuote | null;
  forwarded?: boolean;
  attachments: Attachment[];
  reactions: Reaction[];
  user?: User | null;
}

export interface RoomRead {
  userId: string;
  lastReadAt: number;
}

export interface Room {
  id: string;
  kind: 'group' | 'dm';
  name: string;
  topic: string;
  avatar?: string | null;
  encrypted: boolean;
  createdAt: number;
  /** Who made the group, the one who may remove people. */
  createdBy?: string | null;
  members: User[];
  lastMessage: Message | null;
  unread: number;
  archived?: boolean;
  reads?: RoomRead[];
  pinned?: Message[];
}

export interface Contacts {
  contacts: string[];
  incoming: User[];
  outgoing: User[];
}

export interface LinkPreview {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
}

export interface SearchResult {
  message: Message;
  room?: { id: string; kind: string; name: string } | null;
}

export interface CallToken {
  url: string;
  token: string;
  room: string;
}

export interface ActiveCall {
  roomId: string;
  ringing: boolean;
  startedBy: string;
  startedByName: string;
  startedAt: number;
  participants: string[];
}

export interface IncomingRing {
  roomId: string;
  fromUserId: string;
  fromName: string;
  startedAt: number;
}

export interface AuthConfig {
  registration: 'open' | 'invite' | string;
  twoStep?: boolean;
}

export interface ServerInfo {
  software?: string;
  version?: string;
  apiVersion?: number;
  name?: string;
  motd?: string;
  registration?: string;
  /** Present when this server has mirrors: who is in the group and whether this one is serving people. */
  cluster?: { epoch: number; writable: boolean; nodes: Array<{ url: string; rank: number }> };
  features?: { calls?: boolean; push?: boolean; backups?: boolean; browser?: boolean; twoStep?: boolean; friends?: boolean; crashReports?: boolean };
}

export interface FriendCode {
  code: string;
  display: string;
}

export interface LookupResult {
  user: User | null;
  relation: 'none' | 'contact' | 'incoming' | 'outgoing' | 'blocked' | string;
}

export interface TwoStepStatus {
  enabled: boolean;
  recoveryLeft: number;
}

export interface E2eeWrap {
  senderDevice: string;
  keyId: string;
  eph: string;
  n: string;
  ct: string;
}

export interface E2eeDevice {
  id: string;
  userId: string;
  displayName: string;
  publicKey: string;
  createdAt: number;
  keyIds: string[];
}
