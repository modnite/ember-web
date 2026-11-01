import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { fileSize, isSticker } from '../lib/format';
import { useStore } from '../lib/store';
import type { RoomMediaItem } from '../lib/types';
import { Icon, Sheet } from './kit';
import { AudioPlayer, Viewer, kind, useAttachment } from './media';

type Tab = 'media' | 'files';

const month = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const day = (t: number): string => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** One picture or video in the grid: a square, with a play mark on a video and a lock on a sealed one. */
function Cell({ a, roomId, onOpen }: { a: RoomMediaItem; roomId: string; onOpen: (url: string, name: string, video: boolean) => void }) {
  const { url, locked, failed } = useAttachment(a, roomId);
  const video = kind(a) === 'video';
  return (
    <button type="button" className="shared-cell" aria-label={`Open ${a.filename}`} disabled={!url} onClick={() => url && onOpen(url, a.filename, video)}>
      {locked || failed ? <Icon name={locked ? 'lock' : 'file'} className="shared-ico" /> : null}
      {url && !video ? <img src={url} alt="" loading="lazy" decoding="async" draggable={false} /> : null}
      {url && video ? <video src={`${url}#t=0.1`} preload="metadata" muted playsInline /> : null}
      {video && url ? <span className="shared-play"><Icon name="play" /></span> : null}
    </button>
  );
}

/** One file or voice message in the list. */
function FileRow({ a, roomId, who }: { a: RoomMediaItem; roomId: string; who: string }) {
  const { url, locked } = useAttachment(a, roomId);
  if (kind(a) === 'audio') {
    return (
      <div className="shared-file">
        <div className="shared-audio">{url ? <AudioPlayer src={url} /> : <Icon name={locked ? 'lock' : 'mic'} />}</div>
        <small>Voice message{who ? ` from ${who}` : ''} · {day(a.createdAt)}</small>
      </div>
    );
  }
  return (
    <a className="shared-file link" href={url ?? undefined} download={a.filename} aria-disabled={!url} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Icon name={locked ? 'lock' : 'file'} className="shared-ico" />
      <span className="grow"><b>{locked ? 'Sealed file' : a.filename || 'File'}</b><small>{fileSize(a.size)}{who ? ` · ${who}` : ''} · {day(a.createdAt)}</small></span>
    </a>
  );
}

/** Everything shared in a chat, newest first: pictures and videos in a grid by month, and files and voice messages in a list. */
export function SharedMedia({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me);
  const room = useStore((s) => s.rooms.find((r) => r.id === roomId));
  const [items, setItems] = useState<RoomMediaItem[]>([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('media');
  const [view, setView] = useState<{ url: string; name: string; video: boolean } | null>(null);

  const load = async (): Promise<void> => {
    if (busy || !more) return;
    setBusy(true);
    try {
      const { media } = await api.roomMedia(roomId, items.length ? items[items.length - 1]!.createdAt : undefined);
      setItems((cur) => [...cur, ...media.filter((m) => !cur.some((c) => c.id === m.id))]);
      setMore(media.length >= 60);
      setFailed(false);
    } catch {
      setFailed(true);
      setMore(false);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void load(); /* the first page */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pictures = useMemo(() => items.filter((a) => !isSticker(a) && ['image', 'video'].includes(kind(a))), [items]);
  const files = useMemo(() => items.filter((a) => !isSticker(a) && !['image', 'video'].includes(kind(a))), [items]);
  const shown = tab === 'media' ? pictures : files;
  // A tab that is short because the other kind filled the page keeps asking for the next page, up to a few.
  useEffect(() => {
    if (!busy && more && shown.length < 18 && items.length < 300) void load();
  }, [shown.length, busy, more, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const out: Array<{ label: string; list: RoomMediaItem[] }> = [];
    for (const a of shown) {
      const label = month(a.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.list.push(a);
      else out.push({ label, list: [a] });
    }
    return out;
  }, [shown]);
  const nameOf = (id: string): string => (id === me?.id ? 'You' : room?.members.find((u) => u.id === id)?.displayName ?? users[id]?.displayName ?? '');

  return (
    <>
      <Sheet title="Shared in this chat" onClose={onClose} actions={<button className="btn" onClick={onClose}>Done</button>}>
        <span className="seg" role="group" aria-label="Kind" style={{ display: 'flex', marginBottom: 8 }}>
          <button type="button" aria-pressed={tab === 'media'} onClick={() => setTab('media')} style={{ flex: 1 }}>Pictures and videos</button>
          <button type="button" aria-pressed={tab === 'files'} onClick={() => setTab('files')} style={{ flex: 1 }}>Files and voice</button>
        </span>
        {groups.map((g) => (
          <section key={g.label}>
            <div className="section-title" style={{ padding: '10px 0 4px' }}>{g.label}</div>
            {tab === 'media' ? (
              <div className="shared-grid">{g.list.map((a) => <Cell key={a.id} a={a} roomId={roomId} onOpen={(url, name, video) => setView({ url, name, video })} />)}</div>
            ) : (
              g.list.map((a) => <FileRow key={a.id} a={a} roomId={roomId} who={nameOf(a.userId)} />)
            )}
          </section>
        ))}
        {!busy && shown.length === 0 && !failed ? <p className="empty">{tab === 'media' ? 'No pictures or videos shared yet.' : 'No files or voice messages shared yet.'}</p> : null}
        {failed ? <p className="error-text" role="alert">Could not load what was shared.</p> : null}
        {busy ? <p className="empty">Loading…</p> : null}
        {!busy && more ? <button type="button" className="btn tonal block" style={{ margin: '12px 0' }} onClick={() => void load()}>Show older</button> : null}
      </Sheet>
      {view ? <Viewer url={view.url} name={view.name} video={view.video} onClose={() => setView(null)} /> : null}
    </>
  );
}
