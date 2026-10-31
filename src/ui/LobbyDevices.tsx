import { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../lib/prefs';

interface Devices {
  mics: MediaDeviceInfo[];
  cams: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}

async function list(): Promise<Devices> {
  const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
  return { mics: all.filter((d) => d.kind === 'audioinput'), cams: all.filter((d) => d.kind === 'videoinput'), speakers: all.filter((d) => d.kind === 'audiooutput') };
}

const nameOf = (d: MediaDeviceInfo, i: number, what: string): string => d.label || `${what} ${i + 1}`;

/** Whether this browser can send sound to a chosen speaker (not Safari). */
export const canPickSpeaker = (): boolean => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

function Select({ label, value, onChange, devices, what, none }: { label: string; value: string; onChange: (id: string) => void; devices: MediaDeviceInfo[]; what: string; none: string }) {
  return (
    <label className="lobby-select">
      <span>{label}</span>
      <select value={devices.some((d) => d.deviceId === value) ? value : ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{none}</option>
        {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{nameOf(d, i, what)}</option>)}
      </select>
    </label>
  );
}

/** Microphone, camera and speaker choice with a live microphone level, so a call starts with a sound that is known to work. */
export function LobbyDevices({ micOn, camOn }: { micOn: boolean; camOn: boolean }) {
  const micId = usePrefs((s) => s.micId);
  const camId = usePrefs((s) => s.camId);
  const speakerId = usePrefs((s) => s.speakerId);
  const set = usePrefs((s) => s.set);
  const [devices, setDevices] = useState<Devices>({ mics: [], cams: [], speakers: [] });
  const [level, setLevel] = useState(0);
  const [micError, setMicError] = useState('');
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void list().then(setDevices);
    const on = (): void => { void list().then(setDevices); };
    navigator.mediaDevices?.addEventListener?.('devicechange', on);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', on);
  }, [micOn, camOn]);

  // The microphone level: a quick look at the sound the chosen microphone hears.
  useEffect(() => {
    setLevel(0);
    setMicError('');
    if (!micOn) return;
    let dead = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    const start = async (): Promise<void> => {
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: micId ? { deviceId: { exact: micId } } : true });
        } catch (e) {
          if ((e as Error).name === 'OverconstrainedError' && micId) { set({ micId: '' }); return; }
          throw e;
        }
        if (dead) { stream.getTracks().forEach((t) => t.stop()); return; }
        void list().then(setDevices);
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const data = new Uint8Array(an.fftSize);
        const tick = (): void => {
          an.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          const l = Math.min(1, peak / 64);
          if (bar.current) bar.current.style.width = `${Math.round(l * 100)}%`;
          setLevel((p) => (Math.abs(p - l) > 0.15 ? l : p));
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        if (!dead) setMicError((e as Error).name === 'NotAllowedError' ? 'Allow the microphone to check it.' : 'No microphone could be started.');
      }
    };
    void start();
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [micOn, micId, set]);

  return (
    <div className="lobby-devices">
      {devices.mics.length > 0 ? <Select label="Microphone" value={micId} onChange={(id) => set({ micId: id })} devices={devices.mics} what="Microphone" none="Default" /> : null}
      {micOn ? (
        <div className="meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          <div ref={bar} className="fill" />
        </div>
      ) : null}
      {micError ? <p className="error-text" role="alert">{micError}</p> : null}
      {camOn && devices.cams.length > 1 ? <Select label="Camera" value={camId} onChange={(id) => set({ camId: id })} devices={devices.cams} what="Camera" none="Default" /> : null}
      {canPickSpeaker() && devices.speakers.length > 0 ? <Select label="Speaker" value={speakerId} onChange={(id) => set({ speakerId: id })} devices={devices.speakers} what="Speaker" none="Default" /> : null}
    </div>
  );
}
