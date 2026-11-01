/**
 * Servers that have mirrors tell their apps about them. When the server this page came from stops answering, the page moves to the first mirror
 * that has taken over, carrying the sign-in with it, and moves back by itself once the main server is serving again. Nothing for a person to do.
 *
 * The sign-in travels as a second session made for the purpose (`/api/auth/portable`), kept in this browser and handed to the other server in
 * the address fragment, which is never sent over the network.
 */
import { desktopAllowServers } from './desktop';
import type { ServerInfo } from './types';

interface Group {
  nodes: Array<{ url: string; rank: number }>;
  epoch: number;
}

const GROUP_KEY = 'ember.group';
const TOKEN_KEY = 'ember.portable';
const TOKEN_MAX_AGE = 12 * 3600_000;
const origin = (u: string): string => u.replace(/\/+$/, '');

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: moving between servers then needs a new sign-in */
  }
}

/** Remember who is in the group, from what the server said about itself. */
export function noteGroup(info: ServerInfo | null): void {
  const c = info?.cluster;
  if (!c || c.nodes.length < 2) {
    if (c === undefined && info) try { localStorage.removeItem(GROUP_KEY); } catch { /* nothing to forget */ }
    return;
  }
  write(GROUP_KEY, { nodes: c.nodes.map((n) => ({ url: origin(n.url), rank: n.rank })), epoch: c.epoch } satisfies Group);
  desktopAllowServers(c.nodes.map((n) => origin(n.url)));
}

/** A sign-in made for moving to another server, renewed twice a day. */
export async function refreshPortable(): Promise<void> {
  if (!read<Group>(GROUP_KEY)) return;
  const saved = read<{ token: string; at: number }>(TOKEN_KEY);
  if (saved && Date.now() - saved.at < TOKEN_MAX_AGE) return;
  try {
    const res = await fetch('/api/auth/portable', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (res.ok) write(TOKEN_KEY, { token: ((await res.json()) as { token: string }).token, at: Date.now() });
  } catch {
    /* try again on the next run */
  }
}

/** Arriving from another server of the group: take the sign-in that came with the address. Returns true when a page change was made. */
export async function adoptFromHash(): Promise<void> {
  if (!location.hash.startsWith('#adopt=')) return;
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get('adopt') ?? '';
  const to = params.get('to') ?? '/';
  try {
    if (token) await fetch('/api/auth/adopt', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    write(TOKEN_KEY, { token, at: Date.now() - TOKEN_MAX_AGE + 3600_000 });
  } finally {
    history.replaceState(null, '', `${location.pathname}${location.search}#${to.startsWith('/') ? to : `/${to}`}`);
  }
}

async function probe(base: string): Promise<ServerInfo | null> {
  try {
    const res = await fetch(`${base}/api/server/info`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    return res.ok ? ((await res.json()) as ServerInfo) : null;
  } catch {
    return null;
  }
}

/** A server of the group is only worth moving this page to if it serves the Ember web app as well as the API. */
async function servesEmber(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/manifest.webmanifest`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    return res.ok && ((await res.json()) as { short_name?: string }).short_name === 'Ember';
  } catch {
    return false;
  }
}

function hop(base: string): void {
  const token = read<{ token: string }>(TOKEN_KEY)?.token;
  const to = location.hash.replace(/^#/, '') || '/';
  location.replace(token ? `${base}/#adopt=${encodeURIComponent(token)}&to=${encodeURIComponent(to)}` : `${base}/#${to}`);
}

let fails = 0;
let started = false;

async function tick(): Promise<void> {
  const group = read<Group>(GROUP_KEY);
  if (!group || group.nodes.length < 2) return;
  const here = origin(location.origin);
  const mine = await probe(here);
  const healthy = !!mine && mine.cluster?.writable !== false;
  const ranked = [...group.nodes].sort((a, b) => a.rank - b.rank);
  if (healthy) {
    fails = 0;
    noteGroup(mine);
    // On a mirror that is standing in: go back as soon as the main server is serving again.
    const main = ranked[0]!;
    if (origin(main.url) !== here) {
      const m = await probe(main.url);
      if (m && m.cluster?.writable !== false && (await servesEmber(origin(main.url)))) hop(origin(main.url));
    }
    return;
  }
  fails += 1;
  if (fails < 2) return;
  for (const n of ranked) {
    if (origin(n.url) === here) continue;
    const i = await probe(origin(n.url));
    if (i && i.cluster?.writable !== false && (await servesEmber(origin(n.url)))) {
      hop(origin(n.url));
      return;
    }
  }
}

/** Watch the server this page came from, every few seconds. */
export function startFailover(): void {
  if (started) return;
  started = true;
  window.setInterval(() => { if (!document.hidden || fails > 0) void tick(); }, 8000);
}
