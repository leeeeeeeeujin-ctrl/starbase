import React from 'react';
import { useRouter } from 'next/router';

import dynamic from 'next/dynamic';
const SharedHeroOverlay = dynamic(() => import('@/components/character/SharedHeroOverlay'), { ssr: false });
const ActiveMatchOverlay = dynamic(() => import('@/components/rank/ActiveMatchOverlay'), { ssr: false });
const GlobalChatLauncher = dynamic(() => import('@/components/social/GlobalChatLauncher'), { ssr: false });
const DebugOverlay = dynamic(() => import('@/components/DebugOverlay'), { ssr: false });
const ClientErrorReporter = dynamic(() => import('@/components/ClientErrorReporter'), { ssr: false });

import '../styles/globals.css';
import { GameIntegrationProvider } from '@/components/GameIntegrationContext';

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
  const hideChatLauncher = onTitle || onRoster;

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
  return (
    <GameIntegrationProvider>
      <OverlayAwareShell>
        <ClientErrorReporter />
        <DebugOverlay />
        <Component {...pageProps} />
      </OverlayAwareShell>
    </GameIntegrationProvider>
  );
}
