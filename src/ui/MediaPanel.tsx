import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addFav, favFile, isGif, listFavs, removeFav, stickerFrom, type Fav, type FavKind } from '../lib/favourites';
import { download, sourcesFor, type MediaKind, type OnlineItem, type OnlineSource } from '../lib/online';
import { usePrefs } from '../lib/prefs';
import { useStore } from '../lib/store';
import { Emoji } from './EmojiText';
import { Icon } from './kit';
import { SignalPicker } from './SignalPicker';

type Tab = 'emoji' | 'gif' | 'sticker';
const TABS: [Tab, string][] = [['emoji', 'Emoji'], ['gif', 'GIFs'], ['sticker', 'Stickers']];

interface Group {
  category: string;
  items: Array<{ native: string; name: string; file: string; keywords: string[] }>;
}

let catalog: Promise<{ groups: Group[]; all: Group['items'] }> | null = null;
const loadCatalog = (): Promise<{ groups: Group[]; all: Group['items'] }> => (catalog ??= import('../lib/emojiCatalog').then((m) => ({ groups: m.emojiCatalog, all: m.allEmojis })));

const TAB_NAMES: Record<string, string> = { 'Smileys & Emotion': 'Smileys', 'People & Body': 'People', 'Animals & Nature': 'Animals', 'Food & Drink': 'Food', 'Travel & Places': 'Travel', Activities: 'Activities', Objects: 'Objects', Symbols: 'Symbols', Flags: 'Flags' };

/** The emoji grid: category tabs, search, and the Apple pictures. Also used alone to choose a reaction. */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [data, setData] = useState<{ groups: Group[]; all: Group['items'] } | null>(null);
  const [cat, setCat] = useState(0);
  const [q, setQ] = useState('');
  useEffect(() => { void loadCatalog().then(setData); }, []);
  const items = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    if (!s) return data.groups[cat]?.items ?? [];
    return data.all.filter((e) => e.name.toLowerCase().includes(s) || e.keywords.some((k) => k.toLowerCase().includes(s)));
  }, [data, cat, q]);
  return (
    <div className="mp-body">
      <div className="mp-search"><Icon name="search" /><input type="search" inputMode="search" enterKeyHint="search" placeholder="Search emoji" aria-label="Search emoji" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!q && data ? (
        <div className="mp-cats" role="tablist" aria-label="Emoji groups">
          {data.groups.map((g, i) => (
            <button key={g.category} type="button" role="tab" aria-selected={i === cat} aria-label={TAB_NAMES[g.category] ?? g.category} title={TAB_NAMES[g.category] ?? g.category} onClick={() => setCat(i)}><Emoji emoji={g.items[0]!.native} size={22} /></button>
          ))}
        </div>
      ) : null}
      <div className="mp-grid emoji-grid" role="group" aria-label="Emoji">
        {!data ? <div className="mp-note">Loading…</div> : items.length === 0 ? <div className="mp-note">No emoji found.</div> : items.map((e) => (
          <button key={e.file} type="button" title={e.name} aria-label={e.name} onClick={() => onPick(e.native)}><Emoji emoji={e.native} size={30} /></button>
        ))}
      </div>
    </div>
  );
}

/** One tab of pictures: the ones you keep, or a search of one online service. */
function MediaTab({ kind, onSend }: { kind: MediaKind; onSend: (file: File) => void }) {
  const sources = useMemo(() => sourcesFor(kind), [kind]);
  const keys = usePrefs();
  const showToast = useStore((s) => s.showToast);
  const [source, setSource] = useState<string>('fav');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<OnlineItem[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [favs, setFavs] = useState<Fav[]>([]);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [again, setAgain] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const pick = useRef<HTMLInputElement>(null);
  const favKind: FavKind = kind;
  const active: OnlineSource | undefined = sources.find((s) => s.id === source);
  const missing = active?.needs && !keys[active.needs].trim();

  const reload = useCallback(() => { void listFavs(favKind).then(setFavs); }, [favKind]);
  useEffect(reload, [reload]);

  useEffect(() => {
    if (!active) return;
    if (missing) { setItems([]); setState('idle'); return; }
    let dead = false;
    setState('loading');
    const t = window.setTimeout(() => {
      setBroken(new Set());
      setLoaded(0);
      active.search(kind, q).then((r) => { if (!dead) { setItems(r); setState('idle'); setMessage(r.length ? '' : 'Nothing found.'); } })
        .catch((e: Error) => { if (!dead) { setItems([]); setState('error'); setMessage(e.message); } });
    }, q ? 350 : 0);
    return () => { dead = true; window.clearTimeout(t); };
  }, [active, kind, q, missing, again]);

  async function add(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      if (kind === 'gif') {
        if (!(await isGif(file))) throw new Error('That is not a GIF.');
        await addFav('gif', file);
      } else {
        await addFav('sticker', await stickerFrom(file));
      }
      reload();
      showToast(kind === 'gif' ? 'GIF added' : 'Sticker added');
    } catch (e) {
      showToast(e instanceof Error && e.message ? e.message : kind === 'gif' ? 'That is not a GIF.' : 'Could not make a sticker from that picture.');
    }
  }

  async function sendOnline(item: OnlineItem): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      onSend(await download(item, kind));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not send that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mp-body">
      <div className="mp-sources" role="tablist" aria-label={kind === 'gif' ? 'GIF sources' : 'Sticker sources'}>
        <button type="button" role="tab" aria-selected={source === 'fav'} onClick={() => setSource('fav')}>Favourites</button>
        {kind === 'sticker' ? <button type="button" role="tab" aria-selected={source === 'signal'} onClick={() => setSource('signal')}>Signal packs</button> : null}
        {sources.map((s) => <button key={s.id} type="button" role="tab" aria-selected={source === s.id} onClick={() => setSource(s.id)}>{s.label}</button>)}
      </div>
      {active ? <div className="mp-search"><Icon name="search" /><input type="search" inputMode="search" enterKeyHint="search" placeholder={`Search ${active.label}`} aria-label={`Search ${active.label}`} value={q} onChange={(e) => setQ(e.target.value)} /></div> : null}

      {source === 'signal' ? (
        <SignalPicker onSend={onSend} />
      ) : source === 'fav' ? (
        <div className={`mp-grid ${kind}s`} aria-label={`Your ${kind === 'gif' ? 'GIFs' : 'stickers'}`}>
          <button type="button" className="mp-add" aria-label={kind === 'gif' ? 'Add a GIF' : 'Make a sticker from a picture'} onClick={() => pick.current?.click()}><Icon name="add" /></button>
          <input ref={pick} type="file" accept={kind === 'gif' ? 'image/gif' : 'image/*'} hidden onChange={(e) => { void add(e.target.files?.[0]); e.target.value = ''; }} />
          {favs.map((f) => (
            <FavTile key={f.id} fav={f} kind={kind} onSend={() => onSend(favFile(f))} onRemove={() => { void removeFav(favKind, f.id).then(reload); }} />
          ))}
          {favs.length === 0 ? <div className="mp-note wide">{kind === 'gif' ? 'No GIFs yet. Add a GIF file with the plus, or open a GIF in a chat and save it.' : 'No stickers yet. Make one from any picture with the plus, or save one someone sent you.'}</div> : null}
        </div>
      ) : missing && active ? (
        <div className="mp-note">{active.label} needs a key of your own. <button type="button" className="link" onClick={() => { location.hash = '#/settings'; }}>Add it in Settings</button></div>
      ) : (
        <div className={`mp-grid ${kind}s`} aria-busy={state === 'loading'}>
          {state === 'loading' && items.length === 0 ? <div className="mp-note wide">Searching…</div> : null}
          {state !== 'loading' && message ? <div className="mp-note wide" role="status">{message}</div> : null}
          {state !== 'loading' && items.length > 0 && loaded === 0 && broken.size >= Math.min(3, items.length) ? (
            <div className="mp-note wide" role="status">The pictures could not be loaded. A blocker or filter on this browser or network may be stopping {active?.label}. <button type="button" className="link" onClick={() => setAgain((n) => n + 1)}>Try again</button></div>
          ) : null}
          {items.filter((it) => !broken.has(it.id)).map((it) => (
            <button key={it.id} type="button" className="mp-tile" title={it.title} aria-label={it.title || (kind === 'gif' ? 'GIF' : 'Sticker')} disabled={busy} onClick={() => void sendOnline(it)}>
              {it.glyph ? <Emoji emoji={it.glyph} size={40} /> : <img src={it.preview ?? it.send} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onLoad={() => setLoaded((n) => n + 1)} onError={() => setBroken((b) => new Set(b).add(it.id))} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FavTile({ fav, kind, onSend, onRemove }: { fav: Fav; kind: MediaKind; onSend: () => void; onRemove: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(fav.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [fav.blob]);
  return (
    <div className="mp-fav">
      <button type="button" className="mp-tile" aria-label={kind === 'gif' ? 'Send this GIF' : 'Send this sticker'} onClick={onSend}>{url ? <img src={url} alt="" decoding="async" draggable={false} /> : null}</button>
      <button type="button" className="mp-x" aria-label="Remove from favourites" onClick={onRemove}><Icon name="close" /></button>
    </div>
  );
}

/** Emoji, GIFs and stickers under the message box. Emoji go into the message; a GIF or sticker is sent at once. */
export function MediaPanel({ onEmoji, onSend, onClose }: { onEmoji: (e: string) => void; onSend: (file: File) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('emoji');
  return (
    <div className="media-panel" role="region" aria-label="Emoji, GIFs and stickers">
      <div className="mp-tabs" role="tablist">
        {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
        <button type="button" className="mp-close" aria-label="Close" onClick={onClose}><Icon name="down" /></button>
      </div>
      {tab === 'emoji' ? <EmojiPicker onPick={onEmoji} /> : <MediaTab key={tab} kind={tab} onSend={onSend} />}
    </div>
  );
}
