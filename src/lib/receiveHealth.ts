/** Same bounded receive-stall policy as Android; silence alone never repairs. */
export class ReceiveHealth {
  private samples = new Map<string, { bytes: number; since: number; attempts: number; repaired: number }>();
  clear(): void { this.samples.clear(); }
  stalled(key: string, bytes: number, speaking: boolean, now: number): boolean {
    let s = this.samples.get(key);
    if (!s) { s = { bytes, since: now, attempts: 0, repaired: 0 }; this.samples.set(key, s); }
    if (!speaking || bytes !== s.bytes) { s.bytes = bytes; s.since = now; return false; }
    if (now - s.since < 6000 || s.attempts >= 2 || (s.attempts > 0 && now - s.repaired < 30000)) return false;
    s.attempts++; s.repaired = now; s.since = now;
    return true;
  }
}
