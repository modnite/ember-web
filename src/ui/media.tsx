import { useEffect, useRef, useState } from 'react';
import { attachmentUrl } from '../lib/api';
import { decodeEnvelope, decryptBytes, openBytes, roomKeyFromGroup } from '../lib/crypto';
import { fileSize, isSticker } from '../lib/format';
import { useStore } from '../lib/store';
import type { Attachment } from '../lib/types';
import { Icon, IconButton } from './kit';

/**
 * The address to show an attachment from. A plain file is just its URL (the session cookie goes with it). A sealed file is downloaded, opened
 * with the room key and shown from an object URL, which is released again when the picture leaves the screen.
 */
/** The picture or file of an attachment as a Blob, opened with the room key when it is sealed. */
export async function attachmentBlob(a: Attachment, roomId: string, key: Uint8Array | null): Promise<Blob> {
  const res = await fetch(attachmentUrl(a.id), { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Could not download that.');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!a.encrypted) return new Blob([bytes as BlobPart], { type: a.mime || 'application/octet-stream' });
  if (!key) throw new Error('Set up encryption in this browser first.');
  const env = decodeEnvelope(a.envelope ?? '');
  const plain = env.v === 2 ? openBytes(roomKeyFromGroup(key, roomId, 'file'), env, bytes) : decryptBytes({ kid: env.kid } as never, roomId, env, bytes);
  return new Blob([plain as BlobPart], { type: env.mime || a.mime || 'application/octet-stream' });
}

export function useAttachment(a: Attachment, roomId: string): { url: string | null; locked: boolean; failed: boolean } {
  const key = useStore((s) => s.e2ee.key);
  const sealed = !!a.encrypted;
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: sealed ? null : attachmentUrl(a.id), failed: false });
  useEffect(() => {
    if (!sealed) {
      setState({ url: attachmentUrl(a.id), failed: false });
      return;
    }
    if (!key) return;
    let dead = false;
    let made: string | null = null;
    void (async () => {
      try {
        const res = await fetch(attachmentUrl(a.id), { credentials: 'same-origin' });
        if (!res.ok) throw new Error('download');
        const bytes = new Uint8Array(await res.arrayBuffer());
        const env = decodeEnvelope(a.envelope ?? '');
        const plain = env.v === 2 ? openBytes(roomKeyFromGroup(key, roomId, 'file'), env, bytes) : decryptBytes({ kid: env.kid } as never, roomId, env, bytes);
        made = URL.createObjectURL(new Blob([plain as BlobPart], { type: env.mime || a.mime || 'application/octet-stream' }));
        if (!dead) setState({ url: made, failed: false });
      } catch {
        if (!dead) setState({ url: null, failed: true });
      }
    })();
    return () => {
      dead = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [a.id, a.envelope, a.mime, sealed, key, roomId]);
  return { url: state.url, locked: sealed && !key, failed: state.failed };
}

const kind = (a: Attachment): 'image' | 'video' | 'audio' | 'file' => {
  const m = (a.mime || '').toLowerCase();
  // A sealed picture keeps its real type in the envelope, so the list can still draw it as a picture.
  let real = m;
  if (a.encrypted && a.envelope) {
    try {
      real = (decodeEnvelope(a.envelope).mime || m).toLowerCase();
    } catch {
      /* unreadable envelope: shown as a file */
    }
  }
  if (real.startsWith('image/')) return 'image';
  if (real.startsWith('video/')) return 'video';
  if (real.startsWith('audio/')) return 'audio';
  return 'file';
};

export function AttachmentView({ a, roomId, onOpen }: { a: Attachment; roomId: string; onOpen: (a: Attachment, url: string) => void }) {
  const { url, locked, failed } = useAttachment(a, roomId);
  const k = kind(a);
  const sticker = isSticker(a);
  if (locked) return <div className="file-chip"><Icon name="lock" /><span><b>Sealed {k === 'file' ? 'file' : k}</b><small>Set up encryption to open it</small></span></div>;
  if (failed) return <div className="file-chip"><Icon name="file" /><span><b>Could not open</b><small>{a.filename}</small></span></div>;
  if (k === 'image') {
    const ratio = a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined;
    return (
      <button type="button" className={`media${sticker ? ' sticker' : ''}`} style={{ ...ratio, width: sticker ? 160 : Math.min(a.width || 320, 320) }} onClick={() => url && onOpen(a, url)} aria-label={`Open ${a.filename}`}>
        {url ? <img src={url} alt={a.filename} loading="lazy" decoding="async" draggable={false} /> : null}
      </button>
    );
  }
  if (k === 'video') {
    return (
      <div className="media" style={{ width: 300 }}>
        {url ? <video src={url} controls playsInline preload="metadata" aria-label={a.filename} /> : null}
      </div>
    );
  }
  if (k === 'audio') return url ? <AudioPlayer src={url} /> : null;
  return (
    <a className="file-chip" href={url ?? '#'} download={a.filename} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Icon name="file" />
      <span><b>{a.filename || 'File'}</b><small>{fileSize(a.size)} · tap to save</small></span>
    </a>
  );
}

const mmss = (s: number): string => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

/** Voice messages: iOS needs the sound started from a tap and plays it inline, which is what a button and an audio element give. */
export function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [len, setLen] = useState(0);
  return (
    <div className="audio">
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setLen(e.currentTarget.duration)}
        onDurationChange={(e) => setLen(e.currentTarget.duration)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setT(0); }}
      />
      <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { const a = ref.current; if (!a) return; if (a.paused) void a.play().catch(() => undefined); else a.pause(); }}>
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(len) || 0} aria-valuenow={Math.round(t)}><i style={{ width: len ? `${Math.min(100, (t / len) * 100)}%` : 0 }} /></div>
      <small>{mmss(playing || t > 0 ? t : len)}</small>
    </div>
  );
}

export function Viewer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={name} onClick={onClose}>
      <div className="bar" onClick={(e) => e.stopPropagation()}>
        <IconButton icon="close" label="Close" onClick={onClose} />
        <a className="icon-btn" href={url} download={name} aria-label="Save" title="Save"><Icon name="download" /></a>
      </div>
      <div className="stage"><img src={url} alt={name} onClick={(e) => e.stopPropagation()} /></div>
    </div>
  );
}
