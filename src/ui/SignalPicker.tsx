import { useEffect, useMemo, useRef, useState } from 'react';
import { loadDirectory, loadManifest, loadSticker, searchPacks, stickerFile, type SignalManifest, type SignalPack } from '../lib/signal';
import { useStore } from '../lib/store';
import { Icon } from './kit';

/** A tile that shows a sticker once visible. */
function StickerImage({ pack, id }: { pack: SignalPack; id: number | null }) {
  const holder = useRef<HTMLSpanElement | null>(null);
  const [seen, setSeen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const el = holder.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  useEffect(() => {
    if (!seen || id === null) return;
    let dead = false;
    let made: string | null = null;
    void loadSticker(pack, id).then(({ bytes, ext }) => {
      if (dead) return;
      made = URL.createObjectURL(new Blob([bytes as BlobPart], { type: ext === 'png' ? 'image/png' : 'image/webp' }));
      setUrl(made);
    }).catch(() => undefined);
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [seen, pack, id]);
  return <span ref={holder} className="sig-img">{url ? <img src={url} alt="" decoding="async" draggable={false} /> : null}</span>;
}

function PackTile({ pack, onOpen }: { pack: SignalPack; onOpen: (m: SignalManifest) => void }) {
  const holder = useRef<HTMLButtonElement | null>(null);
  const [seen, setSeen] = useState(false);
  const [manifest, setManifest] = useState<SignalManifest | null>(null);
  useEffect(() => {
    const el = holder.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  useEffect(() => {
    if (!seen) return;
    let dead = false;
    void loadManifest(pack).then((m) => { if (!dead) setManifest(m); }).catch(() => undefined);
    return () => { dead = true; };
  }, [seen, pack]);
  return (
    <button ref={holder} type="button" className="sig-pack" disabled={!manifest} aria-label={manifest?.title || 'Sticker pack'} onClick={() => manifest && onOpen(manifest)}>
      <StickerImage pack={pack} id={manifest ? manifest.cover : null} />
      <span className="sig-title">{manifest?.title || pack.tags[0] || ''}</span>
    </button>
  );
}

/** Signal's public sticker packs: search them by what they are about, open one, tap a sticker to send it. */
export function SignalPicker({ onSend }: { onSend: (file: File) => void }) {
  const showToast = useStore((s) => s.showToast);
  const [packs, setPacks] = useState<SignalPack[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<{ pack: SignalPack; manifest: SignalManifest } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void loadDirectory().then(setPacks).catch((e: Error) => setError(e.message)); }, []);
  const found = useMemo(() => (packs ? searchPacks(packs, q) : []), [packs, q]);

  if (open) {
    return (
      <div className="mp-body">
        <div className="sig-head">
          <button type="button" className="icon-btn" aria-label="Back to the packs" onClick={() => setOpen(null)}><Icon name="back" /></button>
          <span className="sig-name"><b>{open.manifest.title || 'Sticker pack'}</b>{open.manifest.author ? <small>{open.manifest.author}</small> : null}</span>
        </div>
        <div className="mp-grid stickers">
          {open.manifest.stickers.map((s) => (
            <button key={s.id} type="button" className="mp-tile" aria-label={s.emoji ? `Send the ${s.emoji} sticker` : 'Send this sticker'} disabled={busy}
              onClick={() => { setBusy(true); stickerFile(open.pack, s.id).then(onSend).catch((e: Error) => showToast(e.message)).finally(() => setBusy(false)); }}>
              <StickerImage pack={open.pack} id={s.id} />
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="mp-body">
      <div className="mp-search"><Icon name="search" /><input type="search" inputMode="search" enterKeyHint="search" placeholder="Search packs: cat, meme, hello" aria-label="Search Signal packs" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error ? <div className="mp-note" role="alert">{error}</div> : !packs ? <div className="mp-note">Loading the list of packs…</div> : found.length === 0 ? <div className="mp-note">No packs for that. Try cat, meme, hello, love, work…</div> : (
        <div className="mp-grid signal-packs">
          {found.map((p) => <PackTile key={p.id} pack={p} onOpen={(manifest) => setOpen({ pack: p, manifest })} />)}
        </div>
      )}
    </div>
  );
}
