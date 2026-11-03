import { describe, expect, it, vi } from 'vitest';
import { RoomEvent, Track, type Room } from 'livekit-client';
import { ownRoomAudio } from './roomAudio';

describe('call-owned remote sound', () => {
  it('plays late audio, replaces tracks and cleans up independently of video', () => {
    const handlers = new Map<string, () => void>();
    const audio = document.createElement('audio');
    const track = { kind: Track.Kind.Audio, attach: vi.fn(() => audio), detach: vi.fn() };
    const publication = { isSubscribed: true, track, setSubscribed: vi.fn() };
    const publications = new Map([['mic', publication]]);
    const room = { remoteParticipants: new Map(), startAudio: vi.fn(async () => {}), on: vi.fn((e, f) => handlers.set(e, f)), off: vi.fn((e) => handlers.delete(e)) };
    const stop = ownRoomAudio(room as unknown as Room);
    expect(track.attach).not.toHaveBeenCalled();
    room.remoteParticipants.set('remote', { audioTrackPublications: publications });
    handlers.get(RoomEvent.TrackSubscribed)!();
    handlers.get(RoomEvent.TrackSubscribed)!();
    expect(track.attach).toHaveBeenCalledTimes(1);
    expect(audio.isConnected).toBe(true);
    publications.clear();
    handlers.get(RoomEvent.TrackUnsubscribed)!();
    expect(track.detach).toHaveBeenCalledWith(audio);
    expect(audio.isConnected).toBe(false);
    stop();
    expect(handlers.size).toBe(0);
  });
});
