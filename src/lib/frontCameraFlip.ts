import { RoomEvent, Track, type LocalVideoTrack, type Room, type TrackProcessor } from 'livekit-client';
import { isBackCamera } from './mirror';
import { usePrefs } from './prefs';

/**
 * Samsung phones hand a web page (and the Android app's camera bridge) a front camera picture that is already flipped like a selfie preview.
 * Sent as it is, everyone else sees you mirrored, with writing backwards, and our own mirrored self-view turns it back to normal, so your own
 * picture looks wrong too. On those phones the picture is flipped once before it is sent: others see you as you are, and the self-view
 * (mirrored by lib/mirror.ts) looks like a mirror again.
 *
 * Settings, Calls, Flip front camera for others (Auto, On, Off) overrides the guess (which is: a Samsung model number in the user agent).
 */
export const FLIP_PROCESSOR_NAME = 'hearth-front-flip';

export function phoneFlipsFrontCamera(ua: string = navigator.userAgent, setting: string | null = readSetting()): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return /\bSM-[A-Z0-9]{4,}\b/.test(ua);
}

function readSetting(): string | null {
  const v = usePrefs.getState().flipFront;
  return v === 'auto' ? null : v;
}

/** Draws the camera onto a canvas, mirrored when it is the front camera, and hands out the canvas as the track to send. */
export function createFlipProcessor(): TrackProcessor<Track.Kind.Video> {
  let video: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let timer: number | null = null;
  let videoFrame: number | null = null;
  let stopped = true;
  let flip = true;

  const stop = () => {
    stopped = true;
    if (timer !== null) window.clearInterval(timer);
    if (video && videoFrame !== null && 'cancelVideoFrameCallback' in video) (video as HTMLVideoElement & { cancelVideoFrameCallback(h: number): void }).cancelVideoFrameCallback(videoFrame);
    timer = videoFrame = null;
    processor.processedTrack?.stop();
    processor.processedTrack = undefined;
    if (video) video.srcObject = null;
    video = canvas = null;
  };

  const start = async (source: MediaStreamTrack) => {
    stopped = false;
    const settings = source.getSettings();
    flip = !isBackCamera(settings.facingMode, source.label);
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([source]);
    await video.play().catch(() => undefined);
    canvas = document.createElement('canvas');
    canvas.width = settings.width || video.videoWidth || 640;
    canvas.height = settings.height || video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas is not available');
    const draw = () => {
      if (stopped || !video || !canvas) return;
      const w = video.videoWidth || canvas.width;
      const h = video.videoHeight || canvas.height;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      if (flip) ctx.setTransform(-1, 0, 0, 1, w, 0);
      else ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(video, 0, 0, w, h);
    };
    // A new picture drives the drawing where the browser says so; otherwise a steady 30 per second.
    const v = video as HTMLVideoElement & { requestVideoFrameCallback?(cb: () => void): number };
    if (typeof v.requestVideoFrameCallback === 'function') {
      const tick = () => {
        draw();
        if (!stopped && video) videoFrame = v.requestVideoFrameCallback!(tick);
      };
      videoFrame = v.requestVideoFrameCallback(tick);
    } else {
      timer = window.setInterval(draw, 33);
    }
    draw();
    processor.processedTrack = canvas.captureStream(30).getVideoTracks()[0];
  };

  const processor: TrackProcessor<Track.Kind.Video> = {
    name: FLIP_PROCESSOR_NAME,
    processedTrack: undefined,
    async init(opts) {
      await start(opts.track);
    },
    async restart(opts) {
      stop();
      await start(opts.track);
    },
    async destroy() {
      stop();
    },
  };
  return processor;
}

/** Attach the flip to the camera track whenever one is published in this room (a restart or a front/back switch publishes again). */
export function installFrontFlip(room: Room): void {
  room.on(RoomEvent.LocalTrackPublished, (pub) => {
    if (pub.source !== Track.Source.Camera || !pub.track) return;
    const track = pub.track as LocalVideoTrack;
    if (!phoneFlipsFrontCamera()) return;
    if (isBackCamera(track.mediaStreamTrack.getSettings().facingMode, track.mediaStreamTrack.label)) return;
    if (track.getProcessor()?.name === FLIP_PROCESSOR_NAME) return;
    void track.setProcessor(createFlipProcessor()).catch(() => undefined);
  });
}
