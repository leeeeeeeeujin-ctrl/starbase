import React from 'react';
import { useRouter } from 'next/router';

import SharedHeroOverlay from '@/components/character/SharedHeroOverlay';
import ActiveMatchOverlay from '@/components/rank/ActiveMatchOverlay';
import GlobalChatLauncher from '@/components/social/GlobalChatLauncher';
import DebugOverlay from '@/components/DebugOverlay';
import ClientErrorReporter from '@/components/ClientErrorReporter';

import '../styles/globals.css';

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
    <OverlayAwareShell>
      <ClientErrorReporter />
      <DebugOverlay />
      <Component {...pageProps} />
    </OverlayAwareShell>
  );
}
