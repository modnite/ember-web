import { useEffect, useRef, useState } from 'react';
import { IconButton } from './kit';
import { useStore } from '../lib/store';

/** The container each browser can actually record: iOS Safari makes MP4/AAC, Chrome and Firefox make WebM/Opus. */
export function recorderType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) if (MediaRecorder.isTypeSupported(t)) return t;
  return undefined;
}

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Records a voice message. Cancel throws it away; send hands the file back. The microphone is always released. */
export function Recorder({ onDone }: { onDone: (file: File | null) => void }) {
  const showToast = useStore((s) => s.showToast);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const sendIt = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let dead = false;
    let timer: number | null = null;
    void (async () => {
      try {
        const type = recorderType();
        if (!type) throw new Error('This browser cannot record voice messages.');
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        const r = new MediaRecorder(s, { mimeType: type });
        rec.current = r;
        r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
        r.onstop = () => {
          s.getTracks().forEach((t) => t.stop());
          if (!sendIt.current || chunks.current.length === 0) { done.current(null); return; }
          const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
          done.current(new File(chunks.current, `voice-${Date.now()}.${ext}`, { type: type.split(';')[0] }));
        };
        r.start(500);
        timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
      } catch (e) {
        showToast(e instanceof Error && e.name === 'NotAllowedError' ? 'Allow the microphone to record a voice message.' : e instanceof Error ? e.message : 'Could not start recording.');
        done.current(null);
      }
    })();
    return () => {
      dead = true;
      if (timer !== null) window.clearInterval(timer);
      if (rec.current && rec.current.state !== 'inactive') { sendIt.current = false; rec.current.stop(); }
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [showToast]);

  const finish = (send: boolean): void => {
    sendIt.current = send;
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
    else done.current(null);
  };

  return (
    <>
      <IconButton icon="trash" label="Cancel recording" onClick={() => finish(false)} />
      <div className="recording" role="timer" aria-label="Recording"><i />{mmss(seconds)}</div>
      <IconButton icon="send" label="Send voice message" className="send" onClick={() => finish(true)} />
    </>
  );
}
