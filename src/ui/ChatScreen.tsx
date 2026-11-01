import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { startCall } from '../lib/call';
import { clock, dayLabel, isOnline, isSticker, roomPeer, roomTitle, sameDay } from '../lib/format';
import { usePrefs } from '../lib/prefs';
import { useStore } from '../lib/store';
import { isIOS } from '../lib/viewport';
import type { LinkPreview, Message, Room, User } from '../lib/types';
import { Avatar, Confirm, Icon, IconButton, Sheet, type IconName } from './kit';
import { addFav } from '../lib/favourites';
import { quickReactions } from '../lib/emojiUse';
import { isJumbo } from '../lib/emoji';
import { Emoji, EmojiText } from './EmojiText';
import { EmojiPicker, MediaPanel } from './MediaPanel';
import { AttachmentView, attachmentBlob, Viewer } from './media';
import { Recorder } from './Recorder';
import { insertMention, mentionMatches, mentionTrigger, splitMentions, type Person } from '../lib/mentions';
import { RoomInfo } from './RoomInfo';

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

/** Words of a message that are not links: a member named after @ is highlighted, and yours stands out more. */
function Mentioned({ text, members, meId }: { text: string; members: Person[]; meId: string }) {
  return (
    <>
      {splitMentions(text, members).map((piece, i) => (piece.mention
        ? <span key={i} className={`mention${piece.mention.id === meId ? ' me' : ''}`}>{piece.text}</span>
        : <EmojiText key={i} text={piece.text} />))}
    </>
  );
}

function Linkified({ text, members = [], meId = '' }: { text: string; members?: Person[]; meId?: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow">{p}</a> : <Mentioned key={i} text={p} members={members} meId={meId} />))}
    </>
  );
}

const previews = new Map<string, LinkPreview | null | Promise<LinkPreview | null>>();
function usePreview(text: string, enabled: boolean): LinkPreview | null {
  const url = enabled ? text.match(URL_RE)?.[0] : undefined;
  const [p, setP] = useState<LinkPreview | null>(null);
  useEffect(() => {
    if (!url) return;
    let dead = false;
    let cached = previews.get(url);
    if (cached === undefined) {
      cached = api.preview(url).then((r) => r.preview).catch(() => null);
      previews.set(url, cached);
      void cached.then((v) => previews.set(url, v));
    }
    void Promise.resolve(cached).then((v) => { if (!dead) setP(v); });
    return () => { dead = true; };
  }, [url]);
  return p;
}

interface BubbleProps {
  m: Message;
  room: Room;
  meId: string;
  mine: boolean;
  first: boolean;
  last: boolean;
  showName: boolean;
  text: { text: string; locked: boolean; failed: boolean };
  quoteText: string;
  status: 'sending' | 'failed' | 'sent' | 'read';
  onMenu: (m: Message) => void;
  /** Start picking several messages with this one. */
  onPick: (m: Message) => void;
  /** Add or remove this message while several are picked. */
  onToggle: (m: Message) => void;
  onReply: (m: Message) => void;
  onQuickForward: (m: Message) => void;
  selected: boolean;
  selecting: boolean;
  onOpenMedia: (url: string, name: string) => void;
  onJump: (id: string) => void;
  onRetry: (m: Message) => void;
  onDiscard: (m: Message) => void;
  onReact: (m: Message, e: string) => void;
}

const Bubble = memo(function Bubble({ m, room, meId, mine, first, last, showName, text, quoteText, status, onMenu, onPick, onToggle, onReply, onQuickForward, selected, selecting, onOpenMedia, onJump, onRetry, onDiscard, onReact }: BubbleProps) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const longFired = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; on: boolean; dx: number } | null>(null);
  const suppressClick = useRef(false);
  const deleted = !!m.deletedAt;
  const sticker = m.attachments.length === 1 && isSticker(m.attachments[0]!) && !text.text;
  // Pictures, videos and stickers have a round forward button beside them, on the side facing the middle of the screen.
  const quick = !deleted && !selecting && m.attachments.length > 0 && m.attachments.every((a) => /^(image|video)\//.test(a.mime) || isSticker(a));
  const preview = usePreview(text.text, !room.encrypted && !deleted);
  // A picture or video sent alone carries its time on the picture, in a small dark pill, as in the Android app.
  const mediaOnly = !deleted && !text.locked && !text.text && !m.replyTo && !m.forwarded && !(showName && !mine) && m.attachments.length > 0 && m.attachments.every((x) => /^(image|video)\//.test(x.mime) && !isSticker(x));
  const sender = m.user as User | undefined;

  const cancel = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const counts = useMemo(() => {
    const map = new Map<string, { n: number; me: boolean }>();
    for (const r of m.reactions) {
      const e = map.get(r.emoji) ?? { n: 0, me: false };
      e.n++;
      if (r.user_id === meId) e.me = true;
      map.set(r.emoji, e);
    }
    return [...map.entries()];
  }, [m.reactions, meId]);

  const body = deleted ? 'This message was deleted' : text.locked ? 'Sealed message. Set up encryption to read it.' : text.failed ? 'This message could not be read.' : text.text;

  return (
    <>
      <div
        ref={rowRef}
        className={`bubble-row ${mine ? 'mine' : 'theirs'}${first ? ' gap' : ' tight'}${selected ? ' selected' : ''}`}
        data-id={m.id}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' || deleted || selecting) return;
          swipe.current = { x: e.clientX, y: e.clientY, on: false, dx: 0 };
        }}
        onPointerMove={(e) => {
          const s = swipe.current;
          const row = rowRef.current;
          if (!s || !row) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (!s.on) {
            if (dx > 12 && dx > Math.abs(dy) * 1.5) { s.on = true; cancel(); row.setPointerCapture?.(e.pointerId); }
            else if (Math.abs(dy) > 12) { swipe.current = null; return; }
          }
          if (s.on) {
            s.dx = Math.min(140, Math.max(0, dx));
            row.style.transition = 'none';
            row.style.transform = `translateX(${s.dx}px)`;
          }
        }}
        onPointerUp={() => {
          const s = swipe.current;
          swipe.current = null;
          const row = rowRef.current;
          if (!s?.on || !row) return;
          row.style.transition = 'transform 0.2s';
          row.style.transform = '';
          suppressClick.current = true;
          window.setTimeout(() => { suppressClick.current = false; }, 60);
          if (s.dx > 90) { if (navigator.vibrate) navigator.vibrate(12); onReply(m); }
        }}
        onPointerCancel={() => {
          swipe.current = null;
          const row = rowRef.current;
          if (row) { row.style.transition = 'transform 0.2s'; row.style.transform = ''; }
        }}
      >
        {!mine && room.kind === 'group' ? (last ? <Avatar user={sender} name={sender?.displayName ?? '?'} size={30} /> : <span style={{ width: 30, flex: 'none' }} />) : null}
        {mine && quick ? <button type="button" className="quick-fwd" aria-label="Forward" title="Forward" onClick={() => onQuickForward(m)}><Icon name="forward" /></button> : null}
        <div
          className={`bubble${deleted ? ' deleted' : ''}${sticker ? ' sticker' : ''}${m.attachments.length && !deleted ? ' has-media' : ''}${mediaOnly ? ' media-only' : ''}${status === 'sending' ? ' pending' : ''}${status === 'failed' ? ' failed' : ''}`}
          role="group"
          aria-label={`${mine ? 'You' : sender?.displayName ?? 'Someone'}, ${clock(m.createdAt)}`}
          tabIndex={0}
          onContextMenu={(e) => { e.preventDefault(); onMenu(m); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'ContextMenu') { e.preventDefault(); onMenu(m); } }}
          onClickCapture={(e) => {
            // While several are picked, a tap anywhere on a message (a picture too) adds or removes it.
            if (!selecting || deleted) return;
            e.stopPropagation();
            e.preventDefault();
            onToggle(m);
          }}
          onClick={(e) => {
            if (deleted || suppressClick.current) return;
            if (longFired.current) { longFired.current = false; return; }
            // Links, pictures, the voice player and the quote keep their own taps; selecting text with the mouse is not a tap either.
            if ((e.target as HTMLElement).closest('a, button, audio, video, input, textarea, select, .audio, .quote')) return;
            if (window.getSelection()?.toString()) return;
            onMenu(m);
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' || deleted) return;
            start.current = { x: e.clientX, y: e.clientY };
            cancel();
            longFired.current = false;
            timer.current = window.setTimeout(() => { timer.current = null; longFired.current = true; if (navigator.vibrate) navigator.vibrate(12); onPick(m); }, 420);
          }}
          onPointerMove={(e) => { if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) cancel(); }}
          onPointerUp={cancel}
          onPointerCancel={cancel}
          onPointerLeave={cancel}
        >
          {showName && !mine && !sticker ? <div className="sender" style={{ color: sender?.avatarColor }}>{sender?.displayName ?? 'Someone'}</div> : null}
          {m.forwarded && !deleted ? <div className="fwd">Forwarded</div> : null}
          {m.replyTo && !deleted ? (
            <div className="quote" role="button" tabIndex={0} onClick={() => onJump(m.replyTo!.id)} onKeyDown={(e) => { if (e.key === 'Enter') onJump(m.replyTo!.id); }}>
              <b>{m.replyTo.userId === meId ? 'You' : room.members.find((u) => u.id === m.replyTo!.userId)?.displayName ?? 'Someone'}</b>
              <span>{m.replyTo.deleted ? 'This message was deleted' : <EmojiText text={quoteText} />}</span>
            </div>
          ) : null}
          {!deleted ? m.attachments.map((a) => <div key={a.id} style={{ marginBottom: 2 }}><AttachmentView a={a} roomId={m.roomId} onOpen={(att, url) => onOpenMedia(url, att.filename)} /></div>) : null}
          {body ? <div className={`text${!deleted && !text.locked && !text.failed && !m.attachments.length && isJumbo(body) ? ' jumbo' : ''}`}>{deleted || text.locked || text.failed ? body : <Linkified text={body} members={room.kind === 'group' ? room.members : []} meId={meId} />}</div> : null}
          {preview && (preview.title || preview.image) ? (
            <a className="link-card" href={preview.url} target="_blank" rel="noopener noreferrer nofollow">
              {preview.image ? <img src={preview.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
              <div>{preview.siteName ? <small>{preview.siteName}</small> : null}<b>{preview.title}</b>{preview.description ? <span>{preview.description}</span> : null}</div>
            </a>
          ) : null}
          <span className="meta">
            {m.editedAt && !deleted ? <span>edited</span> : null}
            <span>{clock(m.createdAt)}</span>
            {mine && !deleted ? <Icon name={status === 'sending' ? 'clock' : status === 'read' ? 'doneAll' : 'check'} className={status === 'read' ? 'read' : undefined} /> : null}
          </span>
          <div style={{ clear: 'both' }} />
        </div>
        {!mine && quick ? <button type="button" className="quick-fwd" aria-label="Forward" title="Forward" onClick={() => onQuickForward(m)}><Icon name="forward" /></button> : null}
      </div>
      {counts.length > 0 && !deleted ? (
        <div className={`reactions${mine ? ' mine' : ''}`} style={{ marginLeft: !mine && room.kind === 'group' ? 48 : undefined }}>
          {counts.map(([emoji, c]) => (
            <button key={emoji} type="button" className={`reaction${c.me ? ' me' : ''}`} aria-label={`${emoji} ${c.n}${c.me ? ', yours' : ''}`} onClick={() => onReact(m, emoji)}><Emoji emoji={emoji} />{c.n > 1 ? <small>{c.n}</small> : null}</button>
          ))}
        </div>
      ) : null}
      {status === 'failed' ? (
        <div className="retry-line">Not sent.<button type="button" onClick={() => onRetry(m)}>Try again</button><button type="button" onClick={() => onDiscard(m)}>Delete</button></div>
      ) : null}
    </>
  );
});

export function ChatScreen({ roomId, onBack, onClose, wide }: { roomId: string; onBack: () => void; onClose: () => void; wide: boolean }) {
  const store = useStore();
  const { me, rooms, messages, pending, history, typing, e2ee, openRoom, send, sendFiles, events, replyTo, editing, activeCalls } = store;
  const room = rooms.find((r) => r.id === roomId);
  const list = messages[roomId];
  const enterSends = usePrefs((s) => s.enterSends);
  const spell = usePrefs((s) => s.spellcheck);

  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastCount = useRef(0);
  const [below, setBelow] = useState(false);
  const [menu, setMenu] = useState<Message | null>(null);
  const [fwd, setFwd] = useState<Message[] | null>(null);
  const [del, setDel] = useState<Message[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { setPicked([]); }, [roomId]);
  useEffect(() => {
    if (!picked.length) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setPicked([]); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked.length]);
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null);
  const [info, setInfo] = useState(false);
  const [attach, setAttach] = useState(false);
  const [callMenu, setCallMenu] = useState(false);
  const [panel, setPanel] = useState(false);
  const nudgeButton = usePrefs((s) => s.nudgeButton);
  const nudgedAt = useStore((s) => s.nudgeAt[roomId] ?? 0);
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (!nudgedAt || Date.now() - nudgedAt > 1500) return;
    // Off and on again, so a second nudge shakes the chat again instead of joining the first shake.
    setShaking(false);
    const raf = window.requestAnimationFrame(() => setShaking(true));
    const t = window.setTimeout(() => setShaking(false), 800);
    return () => { window.cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [nudgedAt]);
  const [moreReact, setMoreReact] = useState<Message | null>(null);
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const docs = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void openRoom(roomId);
    stick.current = true;
    setDraft(window.localStorage?.getItem(`ember.draft.${roomId}`) ?? '');
    setFiles([]);
    setInfo(false);
    return () => void openRoom(null);
  }, [roomId, openRoom]);

  // Drafts survive switching chats and reloads, as they do in the Android app.
  useEffect(() => {
    try {
      if (draft) localStorage.setItem(`ember.draft.${roomId}`, draft);
      else localStorage.removeItem(`ember.draft.${roomId}`);
    } catch {
      /* storage blocked: the draft only lives while the chat is open */
    }
  }, [draft, roomId]);

  const toBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Follow new messages when already at the bottom (or when I sent one); otherwise offer a button.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !list) return;
    const added = list.length - lastCount.current;
    const mineLast = list.length > 0 && list[list.length - 1]!.userId === me?.id;
    if (lastCount.current === 0 || stick.current || (added > 0 && mineLast)) toBottom();
    else if (added > 0) setBelow(true);
    lastCount.current = list.length;
  }, [list, me?.id, toBottom]);
  useEffect(() => { lastCount.current = 0; setBelow(false); }, [roomId]);

  // When the keyboard opens the list shrinks: keep the newest message in view.
  useEffect(() => {
    const vv = window.visualViewport;
    const onResize = (): void => { if (stick.current) toBottom(); };
    vv?.addEventListener('resize', onResize);
    return () => vv?.removeEventListener('resize', onResize);
  }, [toBottom]);

  const onScroll = (): void => {
    const el = scroller.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = gap < 120;
    if (stick.current) setBelow(false);
    if (el.scrollTop < 80 && history[roomId] === 'more') {
      const before = el.scrollHeight;
      void store.loadOlder(roomId).then(() => requestAnimationFrame(() => { el.scrollTop += el.scrollHeight - before; }));
    }
  };

  const jump = useCallback((id: string) => {
    const el = scroller.current?.querySelector(`[data-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // The message lights up for a moment so the eye finds it.
    el?.classList.add('flash');
    window.setTimeout(() => el?.classList.remove('flash'), 1800);
  }, []);
  const pendingJump = useStore((s) => s.pendingJump);
  const jumpList = useStore((s) => s.messages[roomId]);
  const jumpHistory = useStore((s) => s.history[roomId]);
  useEffect(() => {
    if (!pendingJump || pendingJump.roomId !== roomId || !jumpList) return;
    if (jumpList.some((m) => m.id === pendingJump.id)) {
      stick.current = false;
      const id = pendingJump.id;
      useStore.getState().setJump(null);
      window.setTimeout(() => jump(id), 120);
    } else if (jumpHistory === 'more') {
      void useStore.getState().loadOlder(roomId);
    } else if (jumpHistory === 'done') {
      useStore.getState().setJump(null);
      useStore.getState().showToast('That message is too far back to show here.');
    }
  }, [pendingJump, jumpList, jumpHistory, roomId, jump]);

  const meId = me!.id;
  const peer = room ? roomPeer(room, meId) : undefined;
  const reads = room?.reads ?? [];
  const decrypted = store.text;
  const call = activeCalls[roomId];

  // Nudge and room notices sit among the messages by time, as in the Android app, so new messages arrive below them instead of above.
  const roomEvents = events[roomId];
  const notices = useMemo(() => {
    const before: { id: string; text: string; at: number }[] = [];
    const after = new Map<number, { id: string; text: string; at: number }[]>();
    const times = (list ?? []).map((m) => m.createdAt);
    for (const e of roomEvents ?? []) {
      let at = -1;
      for (let i = 0; i < times.length; i++) if (times[i]! <= e.at) at = i;
      if (at < 0) before.push(e);
      else after.set(at, [...(after.get(at) ?? []), e]);
    }
    return { before, after };
  }, [roomEvents, list]);

  const rows = useMemo(() => {
    if (!list || !room) return [];
    return list.map((m, i) => {
      const prev = list[i - 1];
      const next = list[i + 1];
      const first = !prev || prev.userId !== m.userId || !sameDay(prev.createdAt, m.createdAt);
      const last = !next || next.userId !== m.userId || !sameDay(next.createdAt, m.createdAt);
      const pend = pending[m.id];
      const read = !pend && reads.some((r) => r.userId !== meId && r.lastReadAt >= m.createdAt);
      const quote = m.replyTo ? decrypted({ roomId, body: m.replyTo.body }) : null;
      return { m, first, last, newDay: !prev || !sameDay(prev.createdAt, m.createdAt), status: (pend ? pend.state : read ? 'read' : 'sent') as BubbleProps['status'], quoteText: quote ? (quote.locked ? 'Sealed message' : quote.text) : '' };
    });
  }, [list, room, pending, reads, meId, decrypted, roomId]);

  if (!room || !me) return <div className="empty-main">This chat is not available.</div>;

  const title = roomTitle(room, meId);
  const typers = Object.entries(typing[roomId] ?? {}).filter(([uid, until]) => uid !== meId && until > Date.now()).map(([uid]) => room.members.find((u) => u.id === uid)?.displayName.split(' ')[0] ?? 'Someone');
  const sub = typers.length ? `${typers.join(', ')} ${typers.length > 1 ? 'are' : 'is'} typing…` : room.kind === 'group' ? `${room.members.length} members` : isOnline(peer) ? 'Online' : 'Offline';
  const sealedBlocked = room.encrypted && !e2ee.key;
  // Typing @ in a group lists its members; the list closes when the @ is part of something else (an email) or the name is finished.
  const mention = room.kind === 'group' && !sealedBlocked ? mentionTrigger(draft, caret) : null;
  const mentionOptions = mention ? mentionMatches(room.members, mention.query, meId) : [];
  const pickMention = (p: Person): void => {
    if (!mention) return;
    const next = insertMention(draft, mention, caret, p);
    setDraft(next.text);
    setCaret(next.caret);
    setMentionIdx(0);
    window.requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      grow(el);
    });
  };
  const reply = replyTo[roomId] ?? null;
  const canSend = !sealedBlocked && (draft.trim().length > 0 || files.length > 0);

  async function submit(): Promise<void> {
    if (!canSend) return;
    const text = draft;
    const picked = files;
    setDraft('');
    setFiles([]);
    stick.current = true;
    if (editing) {
      await store.edit(editing, text);
      return;
    }
    if (picked.length) await sendFiles(roomId, picked, text.trim());
    else await send(roomId, text);
    input.current?.focus();
  }

  const grow = (el: HTMLTextAreaElement): void => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  function addFiles(list: FileList | File[] | null): void {
    const picked = Array.from(list ?? []);
    if (picked.length) setFiles((f) => [...f, ...picked].slice(0, 10));
  }

  function insertEmoji(e: string): void {
    const el = input.current;
    const at = el?.selectionStart ?? draft.length;
    const to = el?.selectionEnd ?? at;
    const next = draft.slice(0, at) + e + draft.slice(to);
    setDraft(next);
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.setSelectionRange(at + e.length, at + e.length);
      grow(el);
    });
    store.typingNow(roomId);
  }

  async function saveFavourite(m: Message): Promise<void> {
    const a = m.attachments.find((x) => isSticker(x) || /gif/i.test(x.mime) || /\.gif$/i.test(x.filename));
    if (!a) return;
    try {
      await addFav(isSticker(a) ? 'sticker' : 'gif', await attachmentBlob(a, m.roomId, e2ee.key));
      store.showToast(isSticker(a) ? 'Sticker saved' : 'GIF saved');
    } catch (e) {
      store.showToast(e instanceof Error ? e.message : 'Could not save that.');
    }
  }

  const mineMsg = menu?.userId === meId;
  const savable = !!menu && !menu.deletedAt && menu.attachments.some((x) => isSticker(x) || /gif/i.test(x.mime) || /\.gif$/i.test(x.filename));

  return (
    <div className={`chat${shaking ? ' shake' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
      {picked.length > 0 ? (
        <SelectionBar
          messages={picked.map((id) => (list ?? []).find((x) => x.id === id)).filter((x): x is Message => !!x)}
          meId={meId}
          copyable={(x) => decrypted(x).text}
          onClose={() => setPicked([])}
          onReply={(x) => { store.setReply(roomId, x); setPicked([]); input.current?.focus(); }}
          onCopy={(text) => { void navigator.clipboard?.writeText(text).then(() => store.showToast('Copied')).catch(() => undefined); setPicked([]); }}
          onForward={(xs) => setFwd(xs)}
          onDelete={(xs) => setDel(xs)}
          onPin={(x) => { void store.pin(x); setPicked([]); }}
          onEdit={(x) => { store.setEditing(x); setDraft(decrypted(x).text); setPicked([]); window.setTimeout(() => { const el = input.current; if (el) { el.focus(); grow(el); } }, 50); }}
        />
      ) : null}
      <header className={`chat-header${picked.length > 0 ? ' behind' : ''}`}>
        {!wide ? <IconButton icon="back" label="Back to chats" onClick={onBack} /> : null}
        <button type="button" className="who" onClick={() => setInfo(true)} aria-label={`${title}, details`}>
          <Avatar user={peer} name={title} src={room.kind === 'group' ? room.avatar : undefined} color={room.kind === 'group' ? '#6b8e23' : undefined} size={40} dot />
          <span style={{ minWidth: 0 }}>
            <span className="title">{title}{room.encrypted ? <Icon name="lock" className="lock-ico" /> : null}</span>
            <span className={`sub${typers.length ? ' typing' : ''}`} aria-live="polite">{sub}</span>
          </span>
        </button>
        {nudgeButton ? <button type="button" className="icon-btn" style={{ color: 'var(--primary)' }} aria-label="Nudge" title="Nudge" onClick={() => store.sendNudge(roomId)}><Icon name="wave" /></button> : null}
        <IconButton icon="phone" label="Call" onClick={() => setCallMenu(true)} />
        <IconButton icon="more" label="More" onClick={() => setInfo(true)} />
      </header>

      {call && !call.ringing ? (
        <button type="button" className="banner" style={{ margin: 0, borderRadius: 0 }} onClick={() => void startCall(roomId, true, true)}>
          <Icon name="phone" /><span className="grow">A call is going on. Tap to join.</span>
        </button>
      ) : null}
      {room.pinned && room.pinned.length > 0 ? (
        <button type="button" className="banner warn" style={{ margin: 0, borderRadius: 0, textAlign: 'left' }} onClick={() => jump(room.pinned![0]!.id)}>
          <Icon name="pin" /><span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(() => { const p = decrypted(room.pinned![0]!); return p.locked ? 'Pinned message' : p.text || 'Pinned message'; })()}</span>
        </button>
      ) : null}

      <div className="messages scroll" ref={scroller} onScroll={onScroll} role="log" aria-live="off" aria-label={`Messages with ${title}`}>
        {history[roomId] === 'loading' ? <div className="older">Loading…</div> : null}
        {history[roomId] === 'more' ? <div className="older">Scroll up for older messages</div> : null}
        {notices.before.map((e) => <div key={e.id} className="event">{e.text}</div>)}
        {rows.map(({ m, first, last, newDay, status, quoteText }, rowIndex) => (
          <div key={m.id}>
            {newDay ? <div className="day"><span>{dayLabel(m.createdAt)}</span></div> : null}
            <Bubble m={m} room={room} meId={meId} mine={m.userId === meId} first={first} last={last} showName={room.kind === 'group' && first} text={decrypted(m)} quoteText={quoteText} status={status}
              selected={picked.includes(m.id)} selecting={picked.length > 0} onPick={(x) => setPicked((p) => (p.includes(x.id) ? p : [...p, x.id]))} onToggle={(x) => setPicked((p) => (p.includes(x.id) ? p.filter((i) => i !== x.id) : [...p, x.id]))}
              onReply={(x) => { store.setReply(roomId, x); input.current?.focus(); }} onQuickForward={(x) => setFwd([x])}
              onMenu={setMenu} onOpenMedia={(url, name) => setViewer({ url, name })} onJump={jump} onRetry={(x) => void store.retry(roomId, x.id)} onDiscard={(x) => store.discard(roomId, x.id)} onReact={(x, e) => void store.react(x, e)} />
            {(notices.after.get(rowIndex) ?? []).map((e) => <div key={e.id} className="event">{e.text}</div>)}
          </div>
        ))}
        {rows.length === 0 && history[roomId] !== 'loading' ? <div className="empty-main" style={{ padding: 40 }}>No messages yet. Say hello.</div> : null}
        {below ? <button type="button" className="new-below" onClick={() => { toBottom(true); setBelow(false); }}>New messages</button> : null}
      </div>

      {sealedBlocked ? <EncryptionBanner /> : null}

      <div className="composer-wrap">
        {mentionOptions.length > 0 ? (
          <div className="mention-list" role="listbox" aria-label="Mention someone">
            {mentionOptions.map((p, i) => (
              <button key={p.id} type="button" role="option" aria-selected={i === Math.min(mentionIdx, mentionOptions.length - 1)} className="mention-option" onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(p)}>
                <Avatar user={p as User} size={30} /><span className="grow">{p.displayName}</span><small>@{p.username}</small>
              </button>
            ))}
          </div>
        ) : null}
        {reply ? (
          <div className="reply-bar"><div className="grow"><b>{reply.userId === meId ? 'You' : room.members.find((u) => u.id === reply.userId)?.displayName}</b><span>{(() => { const t = decrypted(reply); return t.locked ? 'Sealed message' : t.text || 'Attachment'; })()}</span></div><IconButton icon="close" label="Cancel reply" onClick={() => store.setReply(roomId, null)} /></div>
        ) : null}
        {editing ? (
          <div className="reply-bar"><div className="grow"><b>Editing</b><span>{decrypted(editing).text}</span></div><IconButton icon="close" label="Cancel editing" onClick={() => { store.setEditing(null); setDraft(''); }} /></div>
        ) : null}
        {files.length > 0 ? (
          <div className="chip-list" aria-label="Attachments to send">
            {files.map((f, i) => <span className="chip" key={`${f.name}${i}`}><Icon name={f.type.startsWith('image/') ? 'photo' : 'file'} className="chip-ico" />{f.name.slice(0, 24)}<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>✕</button></span>)}
          </div>
        ) : null}
        <div className="composer">
          {recording ? (
            <Recorder onDone={(file) => { setRecording(false); if (file) void sendFiles(roomId, [file]); }} />
          ) : (
            <>
              <div className="field">
                {!sealedBlocked ? <IconButton icon="emoji" label={panel ? 'Keyboard' : 'Emoji, GIFs and stickers'} pressed={panel} onClick={() => { if (!panel) input.current?.blur(); setPanel(!panel); if (panel) input.current?.focus(); }} /> : null}
                <textarea
                  ref={input}
                  rows={1}
                  placeholder={sealedBlocked ? 'Set up encryption first' : 'Message'}
                  aria-label="Message"
                  value={draft}
                  disabled={sealedBlocked}
                  spellCheck={spell}
                  autoCorrect={spell ? 'on' : 'off'}
                  autoCapitalize="sentences"
                  enterKeyHint={enterSends ? 'send' : 'enter'}
                  onChange={(e) => { setDraft(e.target.value); setCaret(e.target.selectionStart); setMentionIdx(0); grow(e.target); if (e.target.value) store.typingNow(roomId); }}
                  onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
                  onFocus={() => { stick.current = true; setPanel(false); window.setTimeout(() => toBottom(), 250); }}
                  onKeyDown={(e) => {
                    if (mentionOptions.length > 0) {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionOptions.length); return; }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => (i + mentionOptions.length - 1) % mentionOptions.length); return; }
                      if ((e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent.isComposing) { e.preventDefault(); pickMention(mentionOptions[Math.min(mentionIdx, mentionOptions.length - 1)]!); return; }
                      if (e.key === 'Escape') { e.preventDefault(); setCaret(0); return; }
                    }
                    // Enter sends only if switched on (a phone keyboard's Enter is for new lines); Ctrl/Cmd+Enter always sends.
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && ((enterSends && !e.shiftKey) || e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit().then(() => { const el = input.current; if (el) grow(el); }); }
                    if (e.key === 'Escape' && editing) { store.setEditing(null); setDraft(''); }
                  }}
                  onPaste={(e) => { const pf = Array.from(e.clipboardData.files); if (pf.length) { e.preventDefault(); addFiles(pf); } }}
                />
                <IconButton icon="attach" label="Attach" onClick={() => setAttach(true)} disabled={sealedBlocked} />
              </div>
              {canSend ? <IconButton icon="send" label={editing ? 'Save' : 'Send'} className="send" onClick={() => { void submit().then(() => { const el = input.current; if (el) grow(el); }); }} /> : <IconButton icon="mic" label="Record a voice message" className="send" onClick={() => setRecording(true)} disabled={sealedBlocked} />}
            </>
          )}
        </div>
        {panel && !sealedBlocked ? (
          <MediaPanel onEmoji={insertEmoji} onSend={(file) => { setPanel(false); stick.current = true; void sendFiles(roomId, [file]); }} onClose={() => { setPanel(false); input.current?.focus(); }} />
        ) : null}
        <input ref={picker} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={camera} type="file" accept="image/*,video/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={docs} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {callMenu ? (
        <Sheet onClose={() => setCallMenu(false)}>
          <MenuItem icon="phone" label="Voice call" onClick={() => { setCallMenu(false); void startCall(roomId, false); }} />
          <MenuItem icon="video" label="Video call" onClick={() => { setCallMenu(false); void startCall(roomId, true); }} />
        </Sheet>
      ) : null}

      {attach ? (
        <Sheet onClose={() => setAttach(false)}>
          <MenuItem icon="photo" label="Photo or video" onClick={() => { setAttach(false); picker.current?.click(); }} />
          <MenuItem icon="camera" label={isIOS() ? 'Take a photo' : 'Camera'} onClick={() => { setAttach(false); camera.current?.click(); }} />
          <MenuItem icon="file" label="File" onClick={() => { setAttach(false); docs.current?.click(); }} />
          {!nudgeButton ? <MenuItem icon="wave" label="Nudge" onClick={() => { setAttach(false); store.sendNudge(roomId); }} /> : null}
        </Sheet>
      ) : null}

      {menu ? (
        <Sheet onClose={() => setMenu(null)}>
          {!menu.deletedAt ? (
            <div className="react-bar">{quickReactions().map((e) => <button key={e} type="button" aria-label={`React ${e}`} onClick={() => { void store.react(menu, e); setMenu(null); }}><Emoji emoji={e} size={30} /></button>)}<button type="button" aria-label="More reactions" onClick={() => { setMoreReact(menu); setMenu(null); }}><Icon name="add" /></button></div>
          ) : null}
          {!menu.deletedAt ? <MenuItem icon="reply" label="Reply" onClick={() => { store.setReply(roomId, menu); setMenu(null); input.current?.focus(); }} /> : null}
          {!menu.deletedAt && decrypted(menu).text ? <MenuItem icon="copy" label="Copy" onClick={() => { void navigator.clipboard?.writeText(decrypted(menu).text).then(() => store.showToast('Copied')).catch(() => undefined); setMenu(null); }} /> : null}
          {savable ? <MenuItem icon="photo" label="Save to favourites" onClick={() => { void saveFavourite(menu); setMenu(null); }} /> : null}
          {!menu.deletedAt ? <MenuItem icon="forward" label="Forward" onClick={() => { setFwd([menu]); setMenu(null); }} /> : null}
          {!menu.deletedAt ? <MenuItem icon="pin" label="Pin or unpin" onClick={() => { void store.pin(menu); setMenu(null); }} /> : null}
          {mineMsg && !menu.deletedAt && !menu.attachments.length ? <MenuItem icon="edit" label="Edit" onClick={() => { store.setEditing(menu); setDraft(decrypted(menu).text); setMenu(null); window.setTimeout(() => { const el = input.current; if (el) { el.focus(); grow(el); } }, 50); }} /> : null}
          {mineMsg && !menu.deletedAt ? <MenuItem icon="trash" label="Delete" danger onClick={() => { setDel([menu]); setMenu(null); }} /> : null}
        </Sheet>
      ) : null}
      {moreReact ? (
        <Sheet title="React" onClose={() => setMoreReact(null)}>
          <div className="react-more"><EmojiPicker onPick={(e) => { void store.react(moreReact, e); setMoreReact(null); }} /></div>
        </Sheet>
      ) : null}
      {fwd ? <ForwardTo messages={fwd} onClose={() => { setFwd(null); setPicked([]); }} /> : null}
      {del ? <Confirm title={del.length > 1 ? `Delete ${del.length} messages?` : 'Delete this message?'} text="They disappear for everyone in the chat." yes="Delete" danger onYes={() => { for (const d of del) void store.remove(d); setPicked([]); }} onClose={() => setDel(null)} /> : null}
      {viewer ? <Viewer url={viewer.url} name={viewer.name} onClose={() => setViewer(null)} /> : null}
      {info ? <RoomInfo room={room} onClose={() => setInfo(false)} onLeft={onClose} /> : null}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: IconName; label: string; onClick: () => void; danger?: boolean }) {
  return <button type="button" className={`menu-item${danger ? ' danger' : ''}`} onClick={onClick}><Icon name={icon} />{label}</button>;
}

/** The bar that replaces the chat's title while messages are picked: what can be done with them. */
function SelectionBar({ messages, meId, copyable, onClose, onReply, onCopy, onForward, onDelete, onPin, onEdit }: {
  messages: Message[]; meId: string; copyable: (m: Message) => string;
  onClose: () => void; onReply: (m: Message) => void; onCopy: (text: string) => void; onForward: (ms: Message[]) => void; onDelete: (ms: Message[]) => void; onPin: (m: Message) => void; onEdit: (m: Message) => void;
}) {
  const one = messages.length === 1 ? messages[0]! : null;
  const live = messages.filter((m) => !m.deletedAt);
  const text = live.map(copyable).filter(Boolean).join('\n');
  const allMine = messages.length > 0 && messages.every((m) => m.userId === meId);
  return (
    <div className="select-bar" role="toolbar" aria-label="Selected messages">
      <IconButton icon="close" label="Cancel selection" onClick={onClose} />
      <b className="grow" aria-live="polite">{messages.length} selected</b>
      {one && !one.deletedAt ? <IconButton icon="reply" label="Reply" onClick={() => onReply(one)} /> : null}
      {text ? <IconButton icon="copy" label="Copy" onClick={() => onCopy(text)} /> : null}
      {one && !one.deletedAt ? <IconButton icon="pin" label="Pin or unpin" onClick={() => onPin(one)} /> : null}
      {one && one.userId === meId && !one.deletedAt && !one.attachments.length ? <IconButton icon="edit" label="Edit" onClick={() => onEdit(one)} /> : null}
      {live.length > 0 ? <IconButton icon="forward" label="Forward" onClick={() => onForward(live)} /> : null}
      {allMine && live.length > 0 ? <IconButton icon="trash" label="Delete" onClick={() => onDelete(live)} /> : null}
    </div>
  );
}

function ForwardTo({ messages, onClose }: { messages: Message[]; onClose: () => void }) {
  const { rooms, me, forward } = useStore();
  return (
    <Sheet title="Forward to" onClose={onClose}>
      {rooms.filter((r) => !r.archived).map((r) => (
        <button key={r.id} type="button" className="check-row" onClick={() => { void (async () => { for (const m of messages) await forward(m, r.id); })(); onClose(); }}>
          <Avatar user={roomPeer(r, me!.id)} name={roomTitle(r, me!.id)} src={r.avatar} size={40} />
          <span>{roomTitle(r, me!.id)}</span>
        </button>
      ))}
    </Sheet>
  );
}

/** Shown above the message box when a chat is sealed and this browser does not have the key yet. */
function EncryptionBanner() {
  const { e2ee, setupE2ee } = useStore();
  return (
    <div className="banner" role="status">
      <Icon name="lock" />
      <span className="grow">
        {e2ee.status === 'waiting' ? 'Waiting for one of your other devices to approve this browser. Open Ember on your phone and this will unlock.' : 'This chat is end-to-end encrypted. Set up encryption in this browser to read and write.'}
      </span>
      <button type="button" className="btn tonal" disabled={e2ee.busy} onClick={() => void setupE2ee(e2ee.status !== 'waiting')}>{e2ee.status === 'waiting' ? 'Check again' : 'Set up'}</button>
    </div>
  );
}
