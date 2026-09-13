'use client';

import { useEffect } from 'react';

/**
 * Register the service worker for offline support.
 *
 * Previously an inline next/script block in the root layout. Moving it into a
 * component keeps the layout readable and, more importantly, skips registration
 * in development, where a cached service worker serves stale bundles and makes
 * edits appear not to take effect.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline support is an enhancement; failing to register is not an error
        // worth showing anyone.
      });
    };

    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
    return undefined;
  }, []);

  return null;
}
