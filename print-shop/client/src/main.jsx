import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

// Registering a (cache-free) service worker is what lets Android and desktop
// browsers offer "Install app". iOS installs from Share → Add to Home Screen
// without one.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* not fatal */ });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: { fontFamily: 'Raleway, sans-serif', fontSize: '14px' },
        success: { iconTheme: { primary: '#2B7A8B', secondary: '#fff' } },
      }}
    />
  </React.StrictMode>
);
