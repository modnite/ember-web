/** Mentions: typing @ in a group offers its members, and a name after @ in a message is shown highlighted. */

export interface Person {
  id: string;
  displayName: string;
  username: string;
}

export interface Trigger {
  /** Where the @ is in the text. */
  start: number;
  /** What has been typed after it. */
  query: string;
}

const QUERY_MAX = 30;

/**
 * Whether the caret is just after an @ that starts a mention. The @ must stand at the start of the text or after a space or an opening
 * bracket, so an email address (anna@example.com) never opens the list. The name typed after it has no space in it yet.
 */
export function mentionTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  const query = before.slice(at + 1);
  if (query.length > QUERY_MAX || /\s/.test(query)) return null;
  const prev = at === 0 ? '' : before[at - 1]!;
  if (prev !== '' && !/[\s([{"‘“]/.test(prev)) return null;
  return { start: at, query };
}

const words = (name: string): string[] => name.toLowerCase().split(/[\s._-]+/).filter(Boolean);

/** The members that fit what was typed: names that begin with it first, then names with a word that begins with it. Never yourself. */
export function mentionMatches(members: Person[], query: string, meId: string, limit = 6): Person[] {
  const q = query.toLowerCase();
  const scored: Array<{ p: Person; rank: number }> = [];
  for (const p of members) {
    if (p.id === meId) continue;
    const name = p.displayName.toLowerCase();
    const user = p.username.toLowerCase();
    let rank = -1;
    if (q === '') rank = 2;
    else if (name.startsWith(q) || user.startsWith(q)) rank = 0;
    else if (words(p.displayName).some((w) => w.startsWith(q)) || words(p.username).some((w) => w.startsWith(q))) rank = 1;
    if (rank >= 0) scored.push({ p, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.p.displayName.localeCompare(b.p.displayName));
  return scored.slice(0, limit).map((s) => s.p);
}

/** The text with the typed @query swapped for the chosen name and a space, and where the caret goes after it. */
export function insertMention(text: string, trigger: Trigger, caret: number, p: Person): { text: string; caret: number } {
  const insert = `@${p.displayName} `;
  return { text: text.slice(0, trigger.start) + insert + text.slice(caret), caret: trigger.start + insert.length };
}

export interface Piece {
  text: string;
  mention?: Person;
}

const isWord = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}_]/u.test(c);

/** Splits a message into plain pieces and mentions of members (@Their Name or @theirname), longest names first so "Ann Lee" beats "Ann". */
export function splitMentions(text: string, members: Person[]): Piece[] {
  if (!text.includes('@') || members.length === 0) return [{ text }];
  const names: Array<{ label: string; p: Person }> = [];
  for (const p of members) {
    names.push({ label: p.displayName.toLowerCase(), p });
    if (p.username.toLowerCase() !== p.displayName.toLowerCase()) names.push({ label: p.username.toLowerCase(), p });
  }
  names.sort((a, b) => b.label.length - a.label.length);
  const lower = text.toLowerCase();
  const out: Piece[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@' && (i === 0 || !isWord(text[i - 1]))) {
      const hit = names.find((n) => n.label && lower.startsWith(n.label, i + 1) && !isWord(text[i + 1 + n.label.length]));
      if (hit) {
        if (plain) out.push({ text: plain });
        plain = '';
        out.push({ text: text.slice(i, i + 1 + hit.label.length), mention: hit.p });
        i += 1 + hit.label.length;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  if (plain) out.push({ text: plain });
  return out;
}
