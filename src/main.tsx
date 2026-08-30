import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {installConsoleApi} from './ai/consoleApi';
import './index.css';

// Exposes `window.strudel` for console diagnostics. Prints one line on load;
// verbose per-call logging stays off in production until strudel.debug(true).
installConsoleApi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
