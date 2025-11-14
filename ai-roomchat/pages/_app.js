// Ensure a global guard exists in both SSR and browser to prevent
// ReferenceError from legacy `extensionsOpen` references.
try {
  if (typeof globalThis !== 'undefined') {
    if (typeof globalThis.__EXT_OPEN__ === 'undefined') globalThis.__EXT_OPEN__ = false;
    if (typeof globalThis.extensionsOpen === 'undefined') globalThis.extensionsOpen = globalThis.__EXT_OPEN__;
  }
} catch (_) {}

import { useEffect } from 'react';
import ExtensionsHost from '../components/workspace/ExtensionsHost';
import '../styles/globals.css';

export default function MyApp({ Component, pageProps }) {
  // Register PWA service worker once on the client (for installability/offline support)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (window.__PWA_SW_REGISTERED) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        window.__PWA_SW_REGISTERED = true;

        try {
          if ('ServiceWorkerRegistration' in window && 'sync' in ServiceWorkerRegistration.prototype) {
            await registration.sync?.register?.('sync-game-data');
          }
        } catch {
          // ignore background sync errors
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[pwa] service worker registration failed', err);
      }
    };

    register();
  }, []);

  return (
    <>
      <Component {...pageProps} />
      <ExtensionsHost />
    </>
  );
}
