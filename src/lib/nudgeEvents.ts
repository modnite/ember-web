/** A line in a chat saying someone nudged. Several in a row from one person are one line with a count ("Alex sent a nudge ×5"). */
export interface RoomEvent {
  id: string;
  text: string;
  at: number;
  /** For a nudge: who sent it and how many the line stands for. */
  who?: string;
  count?: number;
}

/** The same person nudging again within a minute of their last nudge raises the count of that line instead of adding another. */
export const NUDGE_MERGE_MS = 60_000;
const MAX_EVENTS = 30;

/** `events` is oldest first. `name` is what the line says ("You", "Alex"). */
export function addNudgeEvent(events: RoomEvent[], who: string, name: string, now: number, id: string): RoomEvent[] {
  const last = events[events.length - 1];
  if (last && last.who === who && last.count && now - last.at < NUDGE_MERGE_MS) {
    const count = last.count + 1;
    return [...events.slice(0, -1), { ...last, text: `${name} sent a nudge ×${count}`, at: now, count }];
  }
  return [...events, { id, text: `${name} sent a nudge`, at: now, who, count: 1 }].slice(-MAX_EVENTS);
}
