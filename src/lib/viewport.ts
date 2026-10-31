/**
 * Keeps CSS variables for the real visible height, which is what iOS makes hard: the on-screen keyboard shrinks the visual viewport but not the
 * layout viewport, so `100vh` and even `100dvh` leave the message box hidden behind it in some versions. `--vh` follows visualViewport.height,
 * `--kb` is how much of the bottom the keyboard covers, and the page never scrolls behind the app shell.
 */
export function installViewport(): void {
  const root = document.documentElement;
  const apply = (): void => {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    const covered = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    root.style.setProperty('--vh', `${h}px`);
    root.style.setProperty('--kb', `${Math.round(covered)}px`);
    root.dataset.keyboard = covered > 120 ? 'open' : 'closed';
    // iOS scrolls the page up to show a focused field; the shell is fixed, so put the page back.
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };
  apply();
  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => window.setTimeout(apply, 250));
}

export const isIOS = (): boolean =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Running as an installed app (home screen), not in a browser tab. */
export const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
