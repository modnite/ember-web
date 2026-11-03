import { expect, it } from 'vitest';
import { ReceiveHealth } from './receiveHealth';
it('leaves silence and advancing audio alone', () => {
  const h = new ReceiveHealth();
  for (let t = 0; t <= 60000; t += 3000) {
    expect(h.stalled('quiet', 0, false, t)).toBe(false);
    expect(h.stalled('speaking', t, true, t)).toBe(false);
  }
});
it('bounds stalled-speech repairs and isolates peers and calls', () => {
  const h = new ReceiveHealth();
  expect(h.stalled('a', 0, true, 0)).toBe(false);
  expect(h.stalled('a', 0, true, 3000)).toBe(false);
  expect(h.stalled('a', 0, true, 6000)).toBe(true);
  expect(h.stalled('a', 0, true, 12000)).toBe(false);
  expect(h.stalled('a', 0, true, 36000)).toBe(true);
  expect(h.stalled('a', 0, true, 90000)).toBe(false);
  expect(h.stalled('b', 0, true, 90000)).toBe(false);
  h.clear();
  expect(h.stalled('a', 0, true, 90000)).toBe(false);
});
