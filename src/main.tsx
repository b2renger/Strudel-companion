import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {installConsoleApi} from './ai/consoleApi';
import {initPwa} from './pwa';
import './index.css';

// Exposes `window.strudel` for console diagnostics. Prints one line on load;
// verbose per-call logging stays off in production until strudel.debug(true).
installConsoleApi();

// Registers the service worker and starts listening for install/update/online
// events. Before render, so nothing is missed: `beforeinstallprompt` can fire
// within milliseconds of load.
initPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
