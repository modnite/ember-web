import { EmojiText } from './EmojiText';
import { memo, useEffect, useMemo, useState } from 'react';
import { searchMessages, snippet, type Hit } from '../lib/search';
import { listTime, messagePreview, roomPeer, roomTitle } from '../lib/format';
import { useStore } from '../lib/store';
import type { Message, Room } from '../lib/types';
import { Avatar, Icon, IconButton } from './kit';
import { NewChat } from './NewChat';

const Row = memo(function Row({ room, meId, selected, typing, preview, onOpen }: { room: Room; meId: string; selected: boolean; typing: boolean; preview: string; onOpen: (id: string) => void }) {
  const peer = roomPeer(room, meId);
  const last = room.lastMessage;
  const mine = last?.userId === meId;
  const unread = room.unread > 0;
  return (
    <button type="button" className="row" aria-selected={selected} onClick={() => onOpen(room.id)}>
      <Avatar user={peer} name={roomTitle(room, meId)} src={room.kind === 'group' ? room.avatar : undefined} color={room.kind === 'group' ? '#6b8e23' : undefined} dot />
      <span className="main">
        <span className="line1">
          <span className="name">{roomTitle(room, meId)}{room.encrypted ? ' ' : ''}{room.encrypted ? <Icon name="lock" className="lock-ico" /> : null}</span>
          {last ? <span className={`time${unread ? ' unread' : ''}`}>{listTime(last.createdAt)}</span> : null}
        </span>
        <span className="line2">
          <span className="preview" style={typing ? { color: 'var(--primary)' } : undefined}>
            {typing ? 'typing…' : last ? <EmojiText text={`${mine ? 'You: ' : room.kind === 'group' && last.user ? `${last.user.displayName.split(' ')[0]}: ` : ''}${preview}`} /> : 'No messages yet'}
          </span>
          {unread ? <span className="badge" aria-label={`${room.unread} unread`}>{room.unread > 99 ? '99+' : room.unread}</span> : null}
        </span>
      </span>
    </button>
  );
});

export function ChatList({ activeId, onOpen }: { activeId: string | null; onOpen: (id: string) => void }) {
  const rooms = useStore((s) => s.rooms);
  const me = useStore((s) => s.me)!;
  const typing = useStore((s) => s.typing);
  const text = useStore((s) => s.text);
  const connected = useStore((s) => s.connected);
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const loaded = useStore((s) => s.messages);
  const setJump = useStore((s) => s.setJump);
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) { setHits([]); setSearching(false); return; }
    let dead = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      const readable = (m: Message): string | null => { const d = useStore.getState().text(m); return d.locked || d.failed ? null : d.text; };
      void searchMessages(needle, rooms, loaded, readable).then((r) => { if (!dead) { setHits(r); setSearching(false); } });
    }, 300);
    return () => { dead = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const { shown, archivedRooms } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (r: Room): boolean => !needle || roomTitle(r, me.id).toLowerCase().includes(needle);
    return { shown: rooms.filter((r) => !r.archived && match(r)), archivedRooms: rooms.filter((r) => r.archived && match(r)) };
  }, [rooms, q, me.id]);
  const archivedUnread = archivedRooms.reduce((n, r) => n + r.unread, 0);
  const list = archived ? archivedRooms : shown;
  const now = Date.now();

  return (
    <>
      <div className="topbar">
        {archived ? <IconButton icon="back" label="Back" onClick={() => setArchived(false)} /> : null}
        <h1>{archived ? 'Archived' : 'Ember'}</h1>
        {!connected ? <span className="time" aria-live="polite" style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Connecting…</span> : null}
      </div>
      <div className="search">
        <Icon name="search" />
        <input type="search" placeholder="Search chats" aria-label="Search chats" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" autoComplete="off" />
      </div>
      <div className="list-wrap">
        <div className="scroll" style={{ flex: 1, minHeight: 0, paddingBottom: 88 }} role="list">
          {list.map((r) => {
            const t = typing[r.id];
            const isTyping = !!t && Object.entries(t).some(([uid, until]) => uid !== me.id && until > now);
            const dec = r.lastMessage ? text(r.lastMessage) : null;
            const body = dec ? (dec.locked ? 'Sealed message' : dec.failed ? 'Could not read this message' : dec.text) : '';
            return <Row key={r.id} room={r} meId={me.id} selected={r.id === activeId} typing={isTyping} preview={messagePreview(r.lastMessage, body)} onOpen={onOpen} />;
          })}
          {!archived && archivedRooms.length > 0 ? (
            <button type="button" className="row" style={{ minHeight: 56 }} onClick={() => setArchived(true)}>
              <Icon name="archive" className="ico" />
              <span className="main"><span className="name">Archived ({archivedRooms.length})</span></span>
              {archivedUnread > 0 ? <span className="badge" style={{ background: 'var(--outline)' }}>{archivedUnread}</span> : null}
            </button>
          ) : null}
          {list.length === 0 && !(archivedRooms.length && !archived) && !(q.trim().length >= 2 && (hits.length > 0 || searching)) ? (
            <div className="empty">{q ? 'No chats or messages match that.' : archived ? 'Nothing archived.' : 'No chats yet. Start one with the button below.'}</div>
          ) : null}
          {!archived && q.trim().length >= 2 && (hits.length > 0 || searching) ? (
            <section aria-label="Messages">
              <div className="group-title">Messages{searching && hits.length === 0 ? '…' : ''}</div>
              {hits.map((h) => {
                const s = snippet(h.text, q.trim());
                const room = rooms.find((r) => r.id === h.room.id);
                const title = room ? roomTitle(room, me.id) : h.room.name || 'Chat';
                const who = h.message.userId === me.id ? 'You' : (h.message.user?.displayName ?? room?.members.find((u) => u.id === h.message.userId)?.displayName ?? 'Someone');
                return (
                  <button key={h.message.id} type="button" className="row hit" onClick={() => { setJump({ roomId: h.room.id, id: h.message.id }); onOpen(h.room.id); }}>
                    <span className="main">
                      <span className="line1"><span className="name">{title}</span><span className="time">{listTime(h.message.createdAt)}</span></span>
                      <span className="line2"><span className="preview">{who}: {s.before}<mark>{s.match}</mark>{s.after}</span></span>
                    </span>
                  </button>
                );
              })}
            </section>
          ) : null}
        </div>
        <button type="button" className="fab" aria-label="New chat" onClick={() => setCreating(true)}><Icon name="add" /></button>
      </div>
      {creating ? <NewChat onClose={() => setCreating(false)} onOpen={(id) => { setCreating(false); onOpen(id); }} /> : null}
    </>
  );
}
