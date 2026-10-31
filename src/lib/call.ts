import {
  ExternalE2EEKeyProvider, ParticipantEvent, RemoteParticipant, Room, RoomEvent, Track,
  type LocalVideoTrack, type Participant, type RoomOptions, type VideoTrack,
} from 'livekit-client';
import { create } from 'zustand';
import { api } from './api';
import { mediaKeyFromGroup } from './crypto';
import { installFrontFlip } from './frontCameraFlip';
import { realtime } from './realtime';
import { playSound } from './sounds';
import { useStore } from './store';

export interface CallPerson {
  identity: string;
  userId: string;
  name: string;
  isLocal: boolean;
  micOn: boolean;
  camOn: boolean;
  speaking: boolean;
  camera?: VideoTrack;
  screen?: VideoTrack;
}

type Phase = 'idle' | 'lobby' | 'connecting' | 'connected' | 'error';

interface CallState {
  phase: Phase;
  roomId: string | null;
  /** True when this person is joining a call somebody else already started (or answering a ring). */
  joining: boolean;
  video: boolean;
  micOn: boolean;
  camOn: boolean;
  facing: 'user' | 'environment';
  canFlip: boolean;
  sharing: boolean;
  error: string | null;
  startedAt: number;
  people: CallPerson[];
  lowBattery: number | null;
  peerBattery: Record<string, { name: string; level: number }>;
}

export const useCall = create<CallState>(() => ({
  phase: 'idle', roomId: null, joining: false, video: false, micOn: true, camOn: false, facing: 'user', canFlip: false, sharing: false,
  error: null, startedAt: 0, people: [], lowBattery: null, peerBattery: {},
}));

const set = useCall.setState;
let room: Room | null = null;
let wake: WakeLockSentinel | null = null;
let battery: { stop: () => void } | null = null;

export const BATTERY_TOPIC = 'ember.battery';
export const BATTERY_STEPS = [20, 15, 10, 5];

/** Whether the battery crossed a step that has not been announced yet (the same rule as the Android app). */
export function batteryCrossed(level: number, charging: boolean, announced: Set<number>): boolean {
  if (charging || level > BATTERY_STEPS[0]!) {
    announced.clear();
    return false;
  }
  const passed = BATTERY_STEPS.filter((s) => level <= s && !announced.has(s));
  if (!passed.length) return false;
  for (const s of passed) announced.add(s);
  return true;
}

/** Open the pre-call screen: camera preview and switches, then Start or Join. */
export function startCall(roomId: string, video: boolean, joining = false): Promise<void> {
  if (useCall.getState().phase !== 'idle') return Promise.resolve();
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    useStore.getState().showToast('Calls need a secure connection (https).');
    return Promise.resolve();
  }
  set({ phase: 'lobby', roomId, joining, video, micOn: true, camOn: video, facing: 'user', error: null, people: [], lowBattery: null, peerBattery: {}, sharing: false });
  return Promise.resolve();
}

export function setLobby(p: Partial<Pick<CallState, 'micOn' | 'camOn' | 'facing'>>): void {
  set(p);
}

export function cancelLobby(): void {
  const { roomId, joining } = useCall.getState();
  // Declining a ring from the pre-call screen.
  if (roomId && joining && useStore.getState().ring?.roomId === roomId) realtime.send({ t: 'call.decline', roomId });
  set({ phase: 'idle', roomId: null });
}

function personOf(p: Participant, local: boolean): CallPerson {
  const userId = p.identity.split(':')[0] ?? p.identity;
  const user = useStore.getState().users[userId];
  const cam = p.getTrackPublication(Track.Source.Camera);
  const scr = p.getTrackPublication(Track.Source.ScreenShare);
  return {
    identity: p.identity,
    userId,
    name: local ? useStore.getState().me?.displayName ?? 'You' : user?.displayName || p.name || 'Someone',
    isLocal: local,
    micOn: p.isMicrophoneEnabled,
    camOn: !!cam && !cam.isMuted && !!cam.track,
    speaking: p.isSpeaking,
    camera: cam?.track as VideoTrack | undefined,
    screen: scr?.track as VideoTrack | undefined,
  };
}

function refresh(): void {
  if (!room) return;
  const people = [personOf(room.localParticipant, true), ...[...room.remoteParticipants.values()].map((p) => personOf(p, false))];
  const localCam = room.localParticipant.getTrackPublication(Track.Source.Camera);
  set({
    people,
    micOn: room.localParticipant.isMicrophoneEnabled,
    camOn: !!localCam && !localCam.isMuted,
    sharing: !!room.localParticipant.getTrackPublication(Track.Source.ScreenShare),
  });
}

async function keepAwake(): Promise<void> {
  try {
    wake = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    wake = null;
  }
}

function watchBattery(r: Room): void {
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }> };
  if (!nav.getBattery) return;
  let dead = false;
  const announced = new Set<number>();
  let told = false;
  const send = (level: number, charging: boolean): void => {
    void r.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ level, charging })), { reliable: true, topic: BATTERY_TOPIC }).catch(() => undefined);
  };
  void nav.getBattery().then((b) => {
    if (dead) return;
    const check = (): void => {
      const level = Math.round(b.level * 100);
      if ((b.charging || level > BATTERY_STEPS[0]!) && useCall.getState().lowBattery !== null) {
        set({ lowBattery: null });
        if (told) send(level, b.charging);
        told = false;
      }
      if (batteryCrossed(level, b.charging, announced)) {
        set({ lowBattery: level });
        told = true;
        send(level, false);
        navigator.vibrate?.([250, 120, 250]);
      }
    };
    for (const e of ['levelchange', 'chargingchange']) b.addEventListener(e, check);
    check();
    battery = { stop: () => { dead = true; for (const e of ['levelchange', 'chargingchange']) b.removeEventListener(e, check); } };
  }).catch(() => undefined);
}

/** Connect for real: from the lobby's Start or Join. */
export async function connectCall(): Promise<void> {
  const s = useCall.getState();
  if (s.phase !== 'lobby' || !s.roomId) return;
  const roomId = s.roomId;
  const store = useStore.getState();
  const info = store.rooms.find((r) => r.id === roomId);
  set({ phase: 'connecting', error: null });
  try {
    const options: RoomOptions = {
      adaptiveStream: true,
      dynacast: true,
      // The browser's own echo cancelling and noise suppression, as in the Hearth web client.
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      videoCaptureDefaults: { facingMode: s.facing },
    };
    let provider: ExternalE2EEKeyProvider | undefined;
    if (info?.encrypted) {
      const key = store.e2ee.key;
      if (!key) throw new Error('This call is end-to-end encrypted. Set up encryption in this browser first.');
      provider = new ExternalE2EEKeyProvider();
      options.encryption = { keyProvider: provider, worker: new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), { type: 'module' }) };
      await provider.setKey(mediaKeyFromGroup(key, roomId));
    }
    const r = new Room(options);
    room = r;
    installFrontFlip(r);
    for (const e of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ActiveSpeakersChanged]) r.on(e, refresh);
    r.localParticipant.on(ParticipantEvent.IsSpeakingChanged, refresh);
    r.on(RoomEvent.ParticipantDisconnected, (p) => set((st) => { const { [p.identity]: _gone, ...rest } = st.peerBattery; void _gone; return { peerBattery: rest }; }));
    r.on(RoomEvent.DataReceived, (data, p, _kind, topic) => {
      if (topic !== BATTERY_TOPIC || !p) return;
      try {
        const m = JSON.parse(new TextDecoder().decode(data)) as { level: number; charging?: boolean };
        set((st) => {
          const rest = { ...st.peerBattery };
          if (m.charging || m.level > 20) delete rest[p.identity];
          else rest[p.identity] = { name: personOf(p, false).name, level: m.level };
          return { peerBattery: rest };
        });
        if (!m.charging && m.level <= 20) navigator.vibrate?.([200, 100, 200]);
      } catch {
        /* not a battery message */
      }
    });
    r.on(RoomEvent.Disconnected, () => { if (useCall.getState().phase === 'connected') void leaveCall(false); });
    if (!s.joining) realtime.send({ t: 'call.start', roomId });
    const { url, token } = await api.callToken(roomId);
    await r.connect(url, token, { rtcConfig: { iceServers: [] } });
    if (provider) await r.setE2EEEnabled(true);
    await r.startAudio().catch(() => undefined);
    realtime.send({ t: 'call.join', roomId });
    if (s.joining && useStore.getState().ring?.roomId === roomId) realtime.send({ t: 'call.accept', roomId });
    set({ phase: 'connected', startedAt: Date.now() });
    await Promise.allSettled([
      s.micOn ? r.localParticipant.setMicrophoneEnabled(true) : Promise.resolve(),
      s.camOn ? r.localParticipant.setCameraEnabled(true, { facingMode: s.facing }) : Promise.resolve(),
    ]);
    const devices = await Room.getLocalDevices('videoinput').catch(() => []);
    set({ canFlip: devices.length > 1 });
    refresh();
    void keepAwake();
    watchBattery(r);
  } catch (e) {
    room?.disconnect().catch(() => undefined);
    room = null;
    set({ phase: 'error', error: e instanceof Error ? e.message : 'The call could not start.' });
  }
}

export async function leaveCall(playEnd = true): Promise<void> {
  const { roomId } = useCall.getState();
  if (roomId) realtime.send({ t: 'call.leave', roomId });
  battery?.stop();
  battery = null;
  void wake?.release().catch(() => undefined);
  wake = null;
  const r = room;
  room = null;
  await r?.disconnect().catch(() => undefined);
  set({ phase: 'idle', roomId: null, people: [], sharing: false, lowBattery: null, peerBattery: {} });
  if (playEnd) playSound('end');
}

export function dismissError(): void {
  set({ phase: 'idle', roomId: null, error: null });
}

export async function toggleMic(): Promise<void> {
  if (!room) return;
  await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled).catch((e: Error) => useStore.getState().showToast(e.message));
  refresh();
}

export async function toggleCamera(): Promise<void> {
  if (!room) return;
  const on = room.localParticipant.getTrackPublication(Track.Source.Camera)?.isMuted === false;
  await room.localParticipant.setCameraEnabled(!on, { facingMode: useCall.getState().facing }).catch((e: Error) => useStore.getState().showToast(e.message));
  refresh();
}

export async function flipCamera(): Promise<void> {
  if (!room) return;
  const next = useCall.getState().facing === 'user' ? 'environment' : 'user';
  const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
  try {
    if (track) await track.restartTrack({ facingMode: next });
    set({ facing: next });
  } catch (e) {
    useStore.getState().showToast(e instanceof Error ? e.message : 'Could not switch the camera.');
  }
  refresh();
}

export async function toggleScreen(): Promise<void> {
  if (!room) return;
  try {
    await room.localParticipant.setScreenShareEnabled(!useCall.getState().sharing);
  } catch {
    /* the person closed the picker */
  }
  refresh();
}

export const canShareScreen = (): boolean => !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices;
export { RemoteParticipant };
