import { api } from './api';
import type { Message, Room, SearchResult } from './types';

export interface Hit {
  message: Message;
  room: { id: string; kind: string; name: string };
  /** The readable text of the message. */
  text: string;
}

/** Where `needle` first occurs in `text` (any case), or -1. */
export const at = (text: string, needle: string): number => text.toLowerCase().indexOf(needle.toLowerCase());

/** A short piece of the text around the match, with an ellipsis where it was cut. */
export function snippet(text: string, needle: string, width = 80): { before: string; match: string; after: string } {
  const flat = text.replace(/\s+/g, ' ').trim();
  const i = at(flat, needle);
  if (i < 0) return { before: flat.slice(0, width) + (flat.length > width ? '…' : ''), match: '', after: '' };
  const start = Math.max(0, i - Math.floor(width / 3));
  const end = Math.min(flat.length, i + needle.length + Math.ceil((width * 2) / 3));
  return { before: (start > 0 ? '…' : '') + flat.slice(start, i), match: flat.slice(i, i + needle.length), after: flat.slice(i + needle.length, end) + (end < flat.length ? '…' : '') };
}

/**
 * Messages that contain `query`. The server searches the chats it can read. Sealed (end-to-end encrypted) chats are searched here, on the
 * messages already loaded in this browser, because only this browser can read them.
 */
export async function searchMessages(query: string, rooms: Room[], loaded: Record<string, Message[]>, readable: (m: Message) => string | null, limit = 40): Promise<Hit[]> {
  const needle = query.trim();
  if (needle.length < 2) return [];
  const byId = new Map<string, Hit>();
  try {
    const { results } = await api.search(needle);
    for (const r of results as SearchResult[]) {
      if (!r.room || r.message.deletedAt) continue;
      const text = readable(r.message);
      if (text !== null && at(text, needle) >= 0) byId.set(r.message.id, { message: r.message, room: r.room, text });
    }
  } catch {
    /* the server could not be asked: sealed chats are still searched below */
  }
  for (const room of rooms) {
    if (!room.encrypted) continue;
    for (const m of loaded[room.id] ?? []) {
      if (m.deletedAt || byId.has(m.id)) continue;
      const text = readable(m);
      if (text !== null && at(text, needle) >= 0) byId.set(m.id, { message: m, room: { id: room.id, kind: room.kind, name: room.name }, text });
    }
  }
  return [...byId.values()].sort((a, b) => b.message.createdAt - a.message.createdAt).slice(0, limit);
}
