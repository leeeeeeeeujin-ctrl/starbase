import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

import '../styles/globals.css';
import { GameIntegrationProvider } from '@/components/GameIntegrationContext';
import installPromptCreationGuard from '../lib/prompts/installPromptCreationGuard.js';

const SharedHeroOverlay = dynamic(() => import('@/components/character/SharedHeroOverlay'), {
  ssr: false,
});
const ActiveMatchOverlay = dynamic(() => import('@/components/rank/ActiveMatchOverlay'), {
  ssr: false,
});
const GlobalChatLauncher = dynamic(() => import('@/components/social/GlobalChatLauncher'), {
  ssr: false,
});
const DebugOverlay = dynamic(() => import('@/components/DebugOverlay'), { ssr: false });
const ClientErrorReporter = dynamic(() => import('@/components/ClientErrorReporter'), {
  ssr: false,
});

function OverlayAwareShell({ children }) {
  const router = useRouter();
  const asPath = (router.asPath || '').toLowerCase();
  const pathname = (router.pathname || '').toLowerCase();

  const hideHeroOverlay =
    pathname.startsWith('/character') ||
    pathname.startsWith('/roster') ||
    pathname.startsWith('/maker') ||
    pathname.startsWith('/prompt');

  const onTitle = pathname === '/' || pathname === '/index' || asPath.startsWith('/title');
  const onRoster = pathname.startsWith('/roster');
  const onMaker = pathname.startsWith('/maker');
  const hideChatLauncher = onTitle || onRoster || onMaker;

  return (
    <>
      {children}
      {!hideHeroOverlay ? <SharedHeroOverlay /> : null}
      {!hideChatLauncher ? <GlobalChatLauncher /> : null}
      <ActiveMatchOverlay />
    </>
  );
}

export default function App({ Component, pageProps }) {
  useEffect(() => {
    try {
      // Install client-side guard to dedupe prompt creation
      installPromptCreationGuard({ windowMs: 3000 });
    } catch {}
  }, []);

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
    <GameIntegrationProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/icon.png" />
      </Head>
      <OverlayAwareShell>
        <ClientErrorReporter />
        <DebugOverlay />
        <Component {...pageProps} />
      </OverlayAwareShell>
    </GameIntegrationProvider>
  );
}
