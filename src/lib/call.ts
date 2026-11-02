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
import { usePrefs } from './prefs';
import { useStore } from './store';

export interface CallPerson {
  identity: string;
  userId: string;
  name: string;
  isLocal: boolean;
  micOn: boolean;
  camOn: boolean;
  speaking: boolean;
  /** Silenced for this person only: the others still hear them. */
  mutedByMe: boolean;
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
  /** How my screen is being sent, while I share it. */
  shareQuality: ShareQuality | null;
  error: string | null;
  startedAt: number;
  people: CallPerson[];
  lowBattery: number | null;
  peerBattery: Record<string, { name: string; level: number }>;
  /** Pictures fill their tile (cropped) or fit inside it (whole picture, bars around). */
  fit: boolean;
  /** The call shrinks to a small window so the rest of the app can be used. */
  minimized: boolean;
}

export const useCall = create<CallState>(() => ({
  phase: 'idle', roomId: null, joining: false, video: false, micOn: true, camOn: false, facing: 'user', canFlip: false, sharing: false, shareQuality: null,
  error: null, startedAt: 0, people: [], lowBattery: null, peerBattery: {}, fit: false, minimized: false,
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
  // A video call starts with the camera on; joining or answering starts the way the camera was left last time.
  set({ phase: 'lobby', roomId, joining, video, micOn: true, camOn: video || rememberedCamera(), facing: 'user', error: null, people: [], lowBattery: null, peerBattery: {}, sharing: false, minimized: false });
  return Promise.resolve();
}

const CAMERA_KEY = 'ember.call.camera';
function rememberedCamera(): boolean {
  try {
    return localStorage.getItem(CAMERA_KEY) === '1';
  } catch {
    return false;
  }
}
function rememberCamera(on: boolean): void {
  try {
    localStorage.setItem(CAMERA_KEY, on ? '1' : '0');
  } catch {
    /* storage blocked: the camera starts the default way */
  }
}

export function setLobby(p: Partial<Pick<CallState, 'micOn' | 'camOn' | 'facing'>>): void {
  if (p.camOn !== undefined) rememberCamera(p.camOn);
  set(p);
}

export function cancelLobby(): void {
  const { roomId, joining } = useCall.getState();
  // Declining a ring from the pre-call screen.
  if (roomId && joining && useStore.getState().ring?.roomId === roomId) realtime.send({ t: 'call.decline', roomId });
  set({ phase: 'idle', roomId: null });
}

/** People silenced for this person on this device (not told to anyone). Cleared when the call ends. */
const mutedForMe = new Set<string>();

export function toggleMuteForMe(identity: string): void {
  if (mutedForMe.has(identity)) mutedForMe.delete(identity);
  else mutedForMe.add(identity);
  refresh();
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
    mutedByMe: !local && mutedForMe.has(p.identity),
    camera: cam?.track as VideoTrack | undefined,
    screen: scr?.track as VideoTrack | undefined,
  };
}

function refresh(): void {
  if (!room) return;
  for (const p of room.remoteParticipants.values()) p.setVolume(mutedForMe.has(p.identity) ? 0 : 1);
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
      videoCaptureDefaults: usePrefs.getState().camId ? { deviceId: usePrefs.getState().camId } : { facingMode: s.facing },
    };
    if (usePrefs.getState().micId) options.audioCaptureDefaults = { ...options.audioCaptureDefaults, deviceId: usePrefs.getState().micId };
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
      s.camOn ? r.localParticipant.setCameraEnabled(true, usePrefs.getState().camId ? { deviceId: usePrefs.getState().camId } : { facingMode: s.facing }) : Promise.resolve(),
    ]);
    const speaker = usePrefs.getState().speakerId;
    if (speaker) await r.switchActiveDevice('audiooutput', speaker).catch(() => undefined);
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
  mutedForMe.clear();
  const { roomId } = useCall.getState();
  if (roomId) realtime.send({ t: 'call.leave', roomId });
  battery?.stop();
  battery = null;
  void wake?.release().catch(() => undefined);
  wake = null;
  const r = room;
  room = null;
  await r?.disconnect().catch(() => undefined);
  set({ phase: 'idle', roomId: null, people: [], sharing: false, lowBattery: null, peerBattery: {}, minimized: false });
  if (playEnd) playSound('end');
}

export const setFit = (fit: boolean): void => set({ fit });
export const setMinimized = (minimized: boolean): void => set({ minimized });

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
  rememberCamera(room.localParticipant.getTrackPublication(Track.Source.Camera)?.isMuted !== false);
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

/**
 * How a shared screen is sent. The default of a call library is a still-picture mode (15 frames a second), which is poor for a game. Gaming keeps
 * the frame rate up and lets the sharpness give way when the line is short; Sharp text does the opposite. A higher bitrate is asked for in each.
 */
export type ShareQuality = 'gaming' | 'everyday' | 'sharp';
export interface ShareChoice { quality: ShareQuality; sound: boolean }

export const SHARE_QUALITIES: Array<{ id: ShareQuality; label: string; note: string }> = [
  { id: 'gaming', label: 'Gaming', note: '60 frames a second' },
  { id: 'everyday', label: 'Everyday', note: '30 frames a second' },
  { id: 'sharp', label: 'Sharp text', note: '15 frames a second' },
];

const SHARE_SPEC = {
  gaming: { fps: 60, bitrate: 9_000_000, hint: 'motion', degradation: 'maintain-framerate' },
  everyday: { fps: 30, bitrate: 4_500_000, hint: 'motion', degradation: 'balanced' },
  sharp: { fps: 15, bitrate: 3_500_000, hint: 'text', degradation: 'maintain-resolution' },
} as const;

const SHARE_KEY = 'ember.share';
export function savedShareChoice(): ShareChoice {
  try {
    const v = JSON.parse(localStorage.getItem(SHARE_KEY) ?? 'null') as Partial<ShareChoice> | null;
    if (v && (v.quality === 'gaming' || v.quality === 'everyday' || v.quality === 'sharp')) return { quality: v.quality, sound: v.sound !== false };
  } catch {
    /* nothing saved */
  }
  return { quality: 'everyday', sound: true };
}

/** Start sharing the screen the way chosen. The browser or the app asks which screen or window. */
export async function startScreenShare(choice: ShareChoice): Promise<void> {
  if (!room) return;
  try { localStorage.setItem(SHARE_KEY, JSON.stringify(choice)); } catch { /* the choice is not remembered */ }
  const spec = SHARE_SPEC[choice.quality];
  try {
    await room.localParticipant.setScreenShareEnabled(
      true,
      { audio: choice.sound, systemAudio: 'include', contentHint: spec.hint, resolution: { width: 1920, height: 1080, frameRate: spec.fps }, selfBrowserSurface: 'exclude', surfaceSwitching: 'include' },
      { screenShareEncoding: { maxBitrate: spec.bitrate, maxFramerate: spec.fps }, degradationPreference: spec.degradation, simulcast: false },
    );
    set({ shareQuality: choice.quality });
  } catch {
    /* the person closed the picker */
  }
  refresh();
}

/** What the shared screen is being sent as (frames a second, size, bitrate), for checking a quality setting. Also reachable from the console. */
export async function shareStats(): Promise<Array<{ fps: number; width: number; height: number; kbps: number; codec: string; limited: string }>> {
  const track = room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track as LocalVideoTrack | undefined;
  const stats = (await track?.getSenderStats()) ?? [];
  return stats.map((s) => ({ fps: s.framesPerSecond ?? 0, width: s.frameWidth ?? 0, height: s.frameHeight ?? 0, kbps: Math.round((s.targetBitrate ?? 0) / 1000), codec: '', limited: s.qualityLimitationReason ?? '' }));
}
(window as unknown as { __emberShareStats?: typeof shareStats }).__emberShareStats = shareStats;

export async function stopScreenShare(): Promise<void> {
  if (!room) return;
  try {
    await room.localParticipant.setScreenShareEnabled(false);
  } catch {
    /* already stopped */
  }
  set({ shareQuality: null });
  refresh();
}

export const canShareScreen = (): boolean => !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices;
export { RemoteParticipant };
