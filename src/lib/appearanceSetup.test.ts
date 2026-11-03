import { expect, it } from 'vitest';
import { firstLookNeeded } from './appearanceSetup';
it('offers first launch and resumes an unfinished preview', () => {
  expect(firstLookNeeded(null, false)).toBe(true);
  expect(firstLookNeeded('pending', true)).toBe(true);
});
it('preserves existing installations and completed setup', () => {
  expect(firstLookNeeded(null, true)).toBe(false);
  expect(firstLookNeeded('done', false)).toBe(false);
});
