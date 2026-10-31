import type { Message, Room, User } from './types';

export const initials = (name: string): string => (name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('') || '?').toUpperCase();

const dayMs = 86_400_000;
const startOfDay = (t: number): number => new Date(t).setHours(0, 0, 0, 0);

/** "1:21 PM", "Yesterday", "Mon", "30 Oct" the way a chat list shows the last activity. */
export function listTime(t: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / dayMs);
  if (days <= 0) return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Date(t).toLocaleDateString([], { weekday: 'short' });
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', ...(days > 300 ? { year: '2-digit' } : {}) });
}

export const clock = (t: number): string => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** "Today", "Yesterday", or the date: the small pill between days in a chat. */
export function dayLabel(t: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / dayMs);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(t).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', ...(days > 300 ? { year: 'numeric' } : {}) });
}

export const sameDay = (a: number, b: number): boolean => startOfDay(a) === startOfDay(b);

export function roomTitle(room: Room, meId: string): string {
  if (room.kind === 'dm') return room.members.find((m) => m.id !== meId)?.displayName || room.name || 'Chat';
  return room.name || 'Group';
}

export function roomPeer(room: Room, meId: string): User | undefined {
  return room.kind === 'dm' ? room.members.find((m) => m.id !== meId) : undefined;
}

export const isOnline = (u?: User | null): boolean => !!u && (u.status === 'online' || u.status === 'away' || u.status === 'busy');

export function fileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
}

/** A sticker is an ordinary picture whose file name says so, so every other client shows it as a picture. */
export const isSticker = (a: { filename: string }): boolean => /^sticker-.*\.(webp|png|gif)$/.test(a.filename);

export function lastActivity(room: Room): number {
  return room.lastMessage?.createdAt ?? room.createdAt;
}

export const messagePreview = (m: Message | null | undefined, text: string): string => {
  if (!m) return '';
  if (m.deletedAt) return 'This message was deleted';
  if (text) return text;
  const a = m.attachments[0];
  if (!a) return '';
  if (isSticker(a)) return 'Sticker';
  if (a.mime.startsWith('image/')) return 'Photo';
  if (a.mime.startsWith('video/')) return 'Video';
  if (a.mime.startsWith('audio/')) return 'Voice message';
  return a.filename || 'File';
};
