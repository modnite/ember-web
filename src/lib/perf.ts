/** Timing log behind a debug flag: set localStorage 'hearth.debug.perf' = '1' (or open /?perf=1) and every
 *  API call, plus boot milestones, is logged to the console with its duration. Safari stalls show up here. */
let on: boolean | null = null;
function enabled(): boolean {
  if (on !== null) return on;
  try {
    on = localStorage.getItem('hearth.debug.perf') === '1' || /[?&]perf=1/.test(location.search);
  } catch {
    on = false;
  }
  return on;
}

export function perfLog(label: string, since: number): void {
  if (!enabled() || typeof performance === 'undefined') return;
  console.info(`[perf] ${label} ${Math.round(performance.now() - since)} ms`);
}

export function perfMark(label: string): void {
  if (!enabled() || typeof performance === 'undefined') return;
  console.info(`[perf] ${label} @ ${Math.round(performance.now())} ms since navigation`);
}
