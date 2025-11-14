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

  useEffect(() => {
    // Register service worker for PWA (if supported)
    try {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const onLoad = () => {
          navigator.serviceWorker.register('/sw.js').catch(() => {});
        };
        window.addEventListener('load', onLoad);
        return () => window.removeEventListener('load', onLoad);
      }
    } catch {}
  }, []);

  return (
    <GameIntegrationProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <meta name="theme-color" content="#0b1220" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>
      <OverlayAwareShell>
        <ClientErrorReporter />
        <DebugOverlay />
        <Component {...pageProps} />
      </OverlayAwareShell>
    </GameIntegrationProvider>
  );
}
