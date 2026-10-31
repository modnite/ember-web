import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { installCrashReporter } from './lib/crashReport';
import { listenForInstall } from './lib/install';
import { usePrefs } from './lib/prefs';
import { applyLook } from './lib/theme';
import { unlockAudio } from './lib/sounds';
import { startServiceWorker } from './lib/update';
import { installViewport } from './lib/viewport';
import { App } from './ui/App';

{
  const p = usePrefs.getState();
  void applyLook({ theme: p.theme, accent: p.accent, wallpaper: p.wallpaper, doodles: p.doodles, wallpaperDim: p.wallpaperDim });
}
installViewport();
installCrashReporter();
listenForInstall();
unlockAudio();
startServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
