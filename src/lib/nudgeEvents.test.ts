import { describe, expect, it } from 'vitest';
import { addNudgeEvent, NUDGE_MERGE_MS, type RoomEvent } from './nudgeEvents';

describe('nudge lines', () => {
  it('one nudge is one line', () => {
    expect(addNudgeEvent([], 'a', 'Alex', 1000, 'e1').map((e) => e.text)).toEqual(['Alex sent a nudge']);
  });

  it('the same person again within a minute raises the count of the same line', () => {
    let e: RoomEvent[] = [];
    for (let i = 0; i < 5; i += 1) e = addNudgeEvent(e, 'a', 'Alex', 1000 + i * 2000, `e${i}`);
    expect(e.map((x) => x.text)).toEqual(['Alex sent a nudge ×5']);
    expect(e[0]!.id).toBe('e0');
  });

  it('a pause of a minute or someone else starts a new line', () => {
    let e = addNudgeEvent([], 'a', 'Alex', 0, 'e0');
    e = addNudgeEvent(e, 'b', 'You', 1000, 'e1');
    e = addNudgeEvent(e, 'b', 'You', 1000 + NUDGE_MERGE_MS, 'e2');
    expect(e.map((x) => x.text)).toEqual(['Alex sent a nudge', 'You sent a nudge', 'You sent a nudge']);
  });

  it('keeps at most thirty lines', () => {
    let e: RoomEvent[] = [];
    for (let i = 0; i < 80; i += 1) e = addNudgeEvent(e, `p${i}`, 'X', i * 100_000, `e${i}`);
    expect(e).toHaveLength(30);
  });
});
