import { describe, expect, it } from 'vitest';
import { insertMention, mentionMatches, mentionTrigger, splitMentions, type Person } from './mentions';

const ann: Person = { id: 'a', displayName: 'Ann Lee', username: 'ann' };
const bo: Person = { id: 'b', displayName: 'Bo', username: 'bobby' };
const me: Person = { id: 'm', displayName: 'Me', username: 'me' };
const all = [ann, bo, me];

describe('when the list opens', () => {
  it('opens for an @ alone, at the start or after a space', () => {
    expect(mentionTrigger('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionTrigger('hello @', 7)).toEqual({ start: 6, query: '' });
    expect(mentionTrigger('hi (@an', 7)).toEqual({ start: 4, query: 'an' });
  });
  it('does not open inside an email address or a word', () => {
    expect(mentionTrigger('write to anna@example.com', 25)).toBeNull();
    expect(mentionTrigger('anna@', 5)).toBeNull();
    expect(mentionTrigger('a@b', 3)).toBeNull();
  });
  it('closes once there is a space after the name, or the caret moved away', () => {
    expect(mentionTrigger('@Ann Le', 7)).toBeNull();
    expect(mentionTrigger('@Ann hello', 10)).toBeNull();
    expect(mentionTrigger('@Ann hello', 4)).toEqual({ start: 0, query: 'Ann' });
  });
});

describe('who it offers', () => {
  it('offers everyone but you for a bare @, and narrows as you type', () => {
    expect(mentionMatches(all, '', 'm').map((p) => p.id)).toEqual(['a', 'b']);
    expect(mentionMatches(all, 'an', 'm').map((p) => p.id)).toEqual(['a']);
    expect(mentionMatches(all, 'bob', 'm').map((p) => p.id)).toEqual(['b']);
    expect(mentionMatches(all, 'lee', 'm').map((p) => p.id)).toEqual(['a']);
    expect(mentionMatches(all, 'zz', 'm')).toEqual([]);
  });
  it('puts names that begin with it before names with a later word that does', () => {
    const lena: Person = { id: 'l', displayName: 'Lena Park', username: 'lena' };
    expect(mentionMatches([ann, lena], 'le', 'm').map((p) => p.id)).toEqual(['l', 'a']);
  });
});

describe('inserting', () => {
  it('swaps the typed @name for the full name and a space', () => {
    const t = mentionTrigger('hey @an', 7)!;
    expect(insertMention('hey @an', t, 7, ann)).toEqual({ text: 'hey @Ann Lee ', caret: 13 });
  });
  it('keeps the text after the caret', () => {
    const t = mentionTrigger('hey @an there', 7)!;
    expect(insertMention('hey @an there', t, 7, ann).text).toBe('hey @Ann Lee  there');
  });
});

describe('showing mentions in a message', () => {
  it('marks a name after @, by display name or username, and leaves the rest', () => {
    expect(splitMentions('hi @Ann Lee, and @bobby!', all)).toEqual([
      { text: 'hi ' }, { text: '@Ann Lee', mention: ann }, { text: ', and ' }, { text: '@bobby', mention: bo }, { text: '!' },
    ]);
  });
  it('prefers the longer name', () => {
    const a2: Person = { id: 'x', displayName: 'Ann', username: 'annie' };
    const out = splitMentions('@Ann Lee hi', [a2, ann]);
    expect(out[0]!.mention).toBe(ann);
  });
  it('does not mark emails, other words or half names', () => {
    expect(splitMentions('mail ann@ann.com', all)).toEqual([{ text: 'mail ann@ann.com' }]);
    expect(splitMentions('@Anna', all)).toEqual([{ text: '@Anna' }]);
    expect(splitMentions('@nobody', all)).toEqual([{ text: '@nobody' }]);
  });
  it('is not case sensitive', () => {
    expect(splitMentions('@ann lee', all)[0]!.mention).toBe(ann);
  });
});
