// Ensure a global guard exists in both SSR and browser to prevent
// ReferenceError from legacy `extensionsOpen` references.
try {
  if (typeof globalThis !== 'undefined') {
    if (typeof globalThis.__EXT_OPEN__ === 'undefined') globalThis.__EXT_OPEN__ = false;
    if (typeof globalThis.extensionsOpen === 'undefined') globalThis.extensionsOpen = globalThis.__EXT_OPEN__;
  }
} catch (_) {}

// Global shim for legacy `debugState` references in old bundles.
try {
  if (typeof globalThis !== 'undefined' && typeof globalThis.debugState !== 'function') {
    globalThis.debugState = function debugStateShim(state, options = {}) {
      try {
        const label = options.label || 'DEBUG';
        if (typeof console !== 'undefined' && typeof console.log === 'function') {
          console.log('[debugState shim]', label, state);
        }
      } catch {
        // ignore logging errors
      }
      return '[debugState shim]';
    };
  }
} catch (_) {}

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import ExtensionsHost from '../components/workspace/ExtensionsHost';
import '../styles/globals.css';

const GlobalChatLauncher = dynamic(() => import('@/components/social/GlobalChatLauncher'), { ssr: false });

function OverlayAwareShell({ children }) {
  const router = useRouter();
  const pathname = (router?.pathname || '').toLowerCase();
  const asPath = (router?.asPath || '').toLowerCase();

  const hideChatLauncher = useMemo(() => {
    const onTitle = pathname === '/' || pathname === '/index' || asPath.startsWith('/title');
    const onRoster = pathname.startsWith('/roster');
    const onMaker = pathname.startsWith('/maker') || pathname.startsWith('/prompt');
    return onTitle || onRoster || onMaker;
  }, [pathname, asPath]);

  return (
    <>
      {children}
      {!hideChatLauncher ? <GlobalChatLauncher /> : null}
    </>
  );
}

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
    <OverlayAwareShell>
      <Component {...pageProps} />
      <ExtensionsHost />
    </OverlayAwareShell>
  );
}
