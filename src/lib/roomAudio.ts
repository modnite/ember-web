import { RoomEvent, Track, type RemoteAudioTrack, type Room } from 'livekit-client';
import { ReceiveHealth } from './receiveHealth';

/** Audio belongs to the call, including while its video UI is minimized. */
export function ownRoomAudio(room: Room): () => void {
  const attached = new Map<RemoteAudioTrack, HTMLMediaElement>();
  let stopped = false;
  const health = new ReceiveHealth();
  const repairing = new Set<string>();
  let sampling = false;
  const reconcile = (): void => {
    if (stopped) return;
    const live = new Set<RemoteAudioTrack>();
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.audioTrackPublications.values()) {
        if (!publication.isSubscribed && !repairing.has(publication.trackSid)) publication.setSubscribed(true);
        if (!publication.track || publication.track.kind !== Track.Kind.Audio) continue;
        const track = publication.track as RemoteAudioTrack;
        live.add(track);
        if (!attached.has(track)) {
          const element = track.attach();
          element.style.display = 'none';
          document.body.appendChild(element);
          attached.set(track, element);
        }
      }
    }
    for (const [track, element] of attached) if (!live.has(track)) {
      track.detach(element); element.remove(); attached.delete(track);
    }
  };
  const resume = (): void => {
    if (!stopped && document.visibilityState === 'visible') void room.startAudio().catch(() => undefined);
  };
  const events = [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.ParticipantDisconnected, RoomEvent.Reconnected] as const;
  for (const event of events) room.on(event, reconcile);
  document.addEventListener('pointerdown', resume);
  document.addEventListener('keydown', resume);
  document.addEventListener('visibilitychange', resume);
  reconcile();
  const monitor = window.setInterval(() => {
    if (sampling || stopped) return;
    sampling = true;
    void (async () => {
      try {
        for (const participant of room.remoteParticipants.values()) {
          const publication = participant.getTrackPublication(Track.Source.Microphone);
          const track = publication?.audioTrack as RemoteAudioTrack | undefined;
          if (!publication || !track) continue;
          const stats = await track.getReceiverStats();
          if (stopped) return;
          if (stats?.bytesReceived === undefined) continue;
          const eligible = participant.isSpeaking && !publication.isMuted && track.getVolume() > 0;
          if (!health.stalled(publication.trackSid, stats.bytesReceived, eligible, performance.now())) continue;
          repairing.add(publication.trackSid);
          try {
            publication.setSubscribed(false);
            await new Promise((resolve) => window.setTimeout(resolve, 250));
            if (!stopped && participant.getTrackPublication(Track.Source.Microphone) === publication) publication.setSubscribed(true);
          } finally { repairing.delete(publication.trackSid); }
        }
      } catch { /* A track can disappear while its stats are being sampled. */ }
      finally { sampling = false; }
    })();
  }, 3000);
  const reconnected = (): void => health.clear();
  room.on(RoomEvent.Reconnected, reconnected);
  return () => {
    stopped = true;
    window.clearInterval(monitor);
    room.off(RoomEvent.Reconnected, reconnected);
    for (const event of events) room.off(event, reconcile);
    document.removeEventListener('pointerdown', resume);
    document.removeEventListener('keydown', resume);
    document.removeEventListener('visibilitychange', resume);
    for (const [track, element] of attached) { track.detach(element); element.remove(); }
    attached.clear();
  };
}
