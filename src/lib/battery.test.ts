import { describe, expect, it } from 'vitest';
import { batteryCrossed } from './call';

describe('batteryCrossed', () => {
  it('stays quiet above 20 percent', () => {
    expect(batteryCrossed(45, false, new Set())).toBe(false);
  });
  it('fires once per step and again after charging', () => {
    const seen = new Set<number>();
    expect(batteryCrossed(20, false, seen)).toBe(true);
    expect(batteryCrossed(19, false, seen)).toBe(false);
    expect(batteryCrossed(15, false, seen)).toBe(true);
    expect(batteryCrossed(4, false, seen)).toBe(true);
    expect(batteryCrossed(50, true, seen)).toBe(false);
    expect(batteryCrossed(20, false, seen)).toBe(true);
  });
  it('does not fire while charging', () => {
    expect(batteryCrossed(8, true, new Set())).toBe(false);
  });
});
