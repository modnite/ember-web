import { useEffect, useRef, useState } from 'react';
import type { VideoTrack } from 'livekit-client';
import { canShareScreen, cancelLobby, connectCall, dismissError, flipCamera, leaveCall, setFit, setLobby, setMinimized, toggleCamera, toggleMic, toggleMuteForMe, toggleScreen, useCall, type CallPerson } from '../lib/call';
import { roomPeer, roomTitle } from '../lib/format';
import { realtime } from '../lib/realtime';
import { usePrefs } from '../lib/prefs';
import { ringUntilStopped } from '../lib/sounds';
import { useStore } from '../lib/store';
import { Avatar, Icon, type IconName } from './kit';
import { LobbyDevices } from './LobbyDevices';

function CallButton({ icon, label, onClick, pressed, className = '' }: { icon: IconName; label: string; onClick: () => void; pressed?: boolean; className?: string }) {
  return <button type="button" className={`call-btn ${className}`} aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}><Icon name={icon} /></button>;
}

/** Attach a LiveKit track to a video element; always muted here (sound comes from the room's own audio elements). */
function TrackVideo({ track, mirror }: { track?: VideoTrack; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className={mirror ? 'mirrored' : undefined} />;
}

function Tile({ p, big }: { p: CallPerson; big?: boolean }) {
  const mirrorSelf = usePrefs((s) => s.mirrorSelf);
  const fitAll = useCall((s) => s.fit);
  // Per tile: null follows the call-wide choice. A shared screen starts out fitted so nothing is cut off.
  const [own, setOwn] = useState<boolean | null>(null);
  const facing = useCall((s) => s.facing);
  const user = useStore((s) => s.users[p.userId]);
  const screen = !!p.screen;
  const track = p.screen ?? p.camera;
  const mirror = p.isLocal && !screen && mirrorSelf && facing === 'user';
  const hasPicture = !!track && (p.camOn || screen);
  const fitted = own ?? (screen ? true : fitAll);
  return (
    <div className={`tile${p.speaking ? ' speaking' : ''}${mirror ? ' mirror' : ''}${fitted ? ' contain' : ''}`} data-big={big ? '1' : undefined}>
      {hasPicture ? <TrackVideo track={track} mirror={mirror} /> : <Avatar user={user} name={p.name} size={88} />}
      {p.isLocal ? null : <button type="button" className={`tile-mute${p.mutedByMe ? ' on' : ''}`} aria-pressed={p.mutedByMe} aria-label={p.mutedByMe ? `Hear ${p.name} again` : `Mute ${p.name} for me`} title={p.mutedByMe ? 'Hear again' : 'Mute for me'} onClick={() => toggleMuteForMe(p.identity)}><Icon name={p.mutedByMe ? 'volumeOff' : 'volume'} /></button>}
      {hasPicture ? <button type="button" className="tile-fit" aria-label={fitted ? `Fill the tile with ${p.isLocal ? 'your picture' : p.name}` : `Fit ${p.isLocal ? 'your picture' : p.name} in the tile`} title={fitted ? 'Fill' : 'Fit'} onClick={() => setOwn(!fitted)}><Icon name={fitted ? 'fullscreen' : 'fullscreenExit'} /></button> : null}
      <span className="label">{p.isLocal ? 'You' : p.name}{p.mutedByMe ? <Icon name="volumeOff" className="mic-ico" /> : null}{!p.micOn ? <Icon name="micOff" className="mic-ico" /> : null}</span>
    </div>
  );
}

const elapsed = (from: number, now: number): string => {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function CallScreen() {
  const c = useCall();
  const room = useStore((s) => s.rooms.find((r) => r.id === c.roomId));
  const me = useStore((s) => s.me)!;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (c.phase !== 'connected') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [c.phase]);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [c.lowBattery]);

  if (c.phase === 'idle') return null;
  const title = room ? roomTitle(room, me.id) : 'Call';
  if (c.phase === 'lobby') return <Lobby title={title} />;
  if (c.phase === 'error') {
    return (
      <div className="call" role="alertdialog" aria-label="Call problem">
        <div className="lobby" style={{ textAlign: 'center' }}>
          <h2>The call could not start</h2>
          <p style={{ opacity: 0.8 }}>{c.error}</p>
          <button className="btn" onClick={dismissError}>Close</button>
        </div>
      </div>
    );
  }
  const people = c.people;
  const sharer = people.find((p) => p.screen);
  const shown = sharer ? [sharer, ...people.filter((p) => p !== sharer)] : people;
  const peerBattery = Object.values(c.peerBattery);
  if (c.minimized) return <Mini title={title} people={people} elapsed={c.phase === 'connected' ? elapsed(c.startedAt, now) : 'Connecting…'} />;
  return (
    <div className="call" role="dialog" aria-modal="true" aria-label={`Call with ${title}`}>
      <div className="call-top">
        <button type="button" className="call-btn small" aria-label="Back to your chats. The call keeps going." title="Back to chats" onClick={() => setMinimized(true)}><Icon name="down" /></button>
        <div className="grow"><b>{title}</b><small>{c.phase === 'connecting' ? 'Connecting…' : people.length < 2 ? 'Ringing…' : elapsed(c.startedAt, now)}</small></div>
        <button type="button" className="call-btn small" aria-label={c.fit ? 'Fill every tile' : 'Fit every picture'} aria-pressed={c.fit} title={c.fit ? 'Fill' : 'Fit'} onClick={() => setFit(!c.fit)}><Icon name={c.fit ? 'fullscreen' : 'fullscreenExit'} /></button>
      </div>
      {c.lowBattery !== null && !dismissed ? <div className="battery-note" role="status"><Icon name="battery" className="mic-ico" /> Your battery is at {c.lowBattery}%. Plug in now and use a fast charger. <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" style={{ color: '#fff', marginLeft: 8 }}>✕</button></div> : null}
      {peerBattery.map((b) => <div className="battery-note" key={b.name} role="status">{b.name}'s battery is at {b.level}%.</div>)}
      <div className="tiles" data-n={Math.min(shown.length, 9)} data-share={sharer ? '1' : undefined}>
        {shown.map((p, i) => <Tile key={p.identity + (p.screen ? 's' : '')} p={p} big={i === 0} />)}
      </div>
      <div className="call-actions">
        <CallButton icon={c.micOn ? 'mic' : 'micOff'} label={c.micOn ? 'Mute' : 'Unmute'} pressed={!c.micOn} onClick={() => void toggleMic()} />
        <CallButton icon={c.camOn ? 'video' : 'videoOff'} label={c.camOn ? 'Camera off' : 'Camera on'} pressed={!c.camOn} onClick={() => void toggleCamera()} />
        {c.canFlip && c.camOn ? <CallButton icon="flip" label="Switch camera" onClick={() => void flipCamera()} /> : null}
        {canShareScreen() ? <CallButton icon="screen" label={c.sharing ? 'Stop sharing' : 'Share screen'} pressed={c.sharing} onClick={() => void toggleScreen()} /> : null}
        <CallButton icon="callEnd" label="Leave the call" className="end" onClick={() => void leaveCall()} />
      </div>
    </div>
  );
}

/** The call as a small window over the app: the other person (or whoever speaks) and the buttons that matter. Tap it to go back to the full call. */
function Mini({ title, people, elapsed: time }: { title: string; people: CallPerson[]; elapsed: string }) {
  const c = useCall();
  const user = useStore((s) => s.users);
  const remote = people.filter((p) => !p.isLocal);
  const main = remote.find((p) => p.speaking) ?? remote.find((p) => p.screen) ?? remote[0] ?? people[0];
  const track = main ? main.screen ?? main.camera : undefined;
  const show = !!main && !!track && (main.camOn || !!main.screen);
  return (
    <div className="call mini" role="region" aria-label={`Call with ${title}`}>
      <button type="button" className="mini-view" aria-label="Return to the call" onClick={() => setMinimized(false)}>
        {show ? <TrackVideo track={track} /> : <Avatar user={main ? user[main.userId] : undefined} name={main?.name ?? title} size={56} />}
        <span className="label">{title} · {time}</span>
      </button>
      <div className="mini-actions">
        <CallButton icon={c.micOn ? 'mic' : 'micOff'} label={c.micOn ? 'Mute' : 'Unmute'} pressed={!c.micOn} onClick={() => void toggleMic()} className="small" />
        <CallButton icon="fullscreen" label="Return to the call" onClick={() => setMinimized(false)} className="small" />
        <CallButton icon="callEnd" label="Leave the call" className="end small" onClick={() => void leaveCall()} />
      </div>
    </div>
  );
}

/** Before joining: see yourself, switch the microphone and camera, then Start or Join. The picture is mirrored like the Android app's. */
function Lobby({ title }: { title: string }) {
  const c = useCall();
  const mirrorSelf = usePrefs((s) => s.mirrorSelf);
  const camId = usePrefs((s) => s.camId);
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null;
    let dead = false;
    const el = ref.current;
    if (!c.camOn) { if (el) el.srcObject = null; return; }
    void navigator.mediaDevices.getUserMedia({ video: camId ? { deviceId: { exact: camId } } : { facingMode: c.facing }, audio: false }).then((s) => {
      if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      if (el) el.srcObject = s;
    }).catch((e: Error) => setErr(e.name === 'NotAllowedError' ? 'Allow the camera to be seen in the call.' : 'No camera could be started.'));
    return () => { dead = true; stream?.getTracks().forEach((t) => t.stop()); if (el) el.srcObject = null; };
  }, [c.camOn, c.facing, camId]);
  return (
    <div className="call" role="dialog" aria-modal="true" aria-label="Before you join">
      <div className="call-top"><div className="grow"><b>{title}</b><small>Check how you look and sound before you join</small></div></div>
      <div className="lobby">
        <div className={`preview${mirrorSelf && c.facing === 'user' ? ' mirror' : ''}`}>
          {c.camOn ? <video ref={ref} autoPlay playsInline muted /> : <Icon name="videoOff" className="mic-ico" />}
        </div>
        {err ? <p className="error-text" role="alert">{err}</p> : null}
        <div className="side" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <LobbyDevices micOn={c.micOn} camOn={c.camOn} />
          <div className="call-actions" style={{ padding: 0 }}>
            <CallButton icon={c.micOn ? 'mic' : 'micOff'} label={c.micOn ? 'Mute' : 'Unmute'} pressed={!c.micOn} onClick={() => setLobby({ micOn: !c.micOn })} />
            <CallButton icon={c.camOn ? 'video' : 'videoOff'} label={c.camOn ? 'Camera off' : 'Camera on'} pressed={!c.camOn} onClick={() => setLobby({ camOn: !c.camOn })} />
            {c.camOn ? <CallButton icon="flip" label="Switch camera" onClick={() => setLobby({ facing: c.facing === 'user' ? 'environment' : 'user' })} /> : null}
          </div>
          <button className="btn block" onClick={() => void connectCall()}>{c.joining ? 'Join call' : 'Start call'}</button>
          <button className="btn text block" style={{ color: '#fff' }} onClick={cancelLobby}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** Someone is calling: a card over everything, with a ring until it is answered, declined or stops. */
export function RingCard() {
  const ring = useStore((s) => s.ring);
  const rooms = useStore((s) => s.rooms);
  const users = useStore((s) => s.users);
  const phase = useCall((s) => s.phase);
  useEffect(() => {
    if (!ring || phase !== 'idle') return;
    const stop = ringUntilStopped();
    return stop;
  }, [ring, phase]);
  if (!ring || phase !== 'idle') return null;
  const room = rooms.find((r) => r.id === ring.roomId);
  return (
    <div className="ringing" role="alertdialog" aria-label={`${ring.fromName} is calling`}>
      <Avatar user={users[ring.fromUserId]} name={ring.fromName} size={48} />
      <div className="grow"><b>{ring.fromName}</b><br /><small style={{ opacity: 0.75 }}>{room && room.kind === 'group' ? `Calling ${room.name}` : 'Calling you'}</small></div>
      <CallButton icon="callEnd" label="Decline" className="end" onClick={() => { realtime.send({ t: 'call.decline', roomId: ring.roomId }); useStore.setState({ ring: null }); }} />
      <CallButton icon="video" label="Answer" className="accept" onClick={() => { void import('../lib/call').then((m) => m.startCall(ring.roomId, true, true)); }} />
    </div>
  );
}

export { roomPeer };
