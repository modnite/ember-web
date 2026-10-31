import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { installCrashReporter } from './lib/crashReport';
import { listenForInstall } from './lib/install';
import { applyTheme, usePrefs } from './lib/prefs';
import { unlockAudio } from './lib/sounds';
import { startServiceWorker } from './lib/update';
import { installViewport } from './lib/viewport';
import { App } from './ui/App';

applyTheme(usePrefs.getState().theme);
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
