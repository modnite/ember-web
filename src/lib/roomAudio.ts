import { RoomEvent, Track, type RemoteAudioTrack, type Room } from 'livekit-client';

/** Audio belongs to the call, including while its video UI is minimized. */
export function ownRoomAudio(room: Room): () => void {
  const attached = new Map<RemoteAudioTrack, HTMLMediaElement>();
  let stopped = false;
  const reconcile = (): void => {
    if (stopped) return;
    const live = new Set<RemoteAudioTrack>();
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.audioTrackPublications.values()) {
        if (!publication.isSubscribed) publication.setSubscribed(true);
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
  return () => {
    stopped = true;
    for (const event of events) room.off(event, reconcile);
    document.removeEventListener('pointerdown', resume);
    document.removeEventListener('keydown', resume);
    document.removeEventListener('visibilitychange', resume);
    for (const [track, element] of attached) { track.detach(element); element.remove(); }
    attached.clear();
  };
}
