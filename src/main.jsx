import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Handy for support/debugging: which deploy is this tab running?
window.__SPLITBOX_BUILD__ = __BUILD_ID__;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
