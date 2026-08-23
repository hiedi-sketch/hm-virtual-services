import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

// There used to be a service worker here, purely so Chrome would offer an
// "Install app" button. It also sat in front of every API request, which is a
// bad trade for something iOS never needed — it installs from Share → Add to
// Home Screen regardless. A registered worker survives its script being
// deleted, so any copy still installed has to be removed explicitly.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations?.()
    .then((registrations) => registrations.forEach((r) => r.unregister()))
    .catch(() => { /* nothing to clean up */ });
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
