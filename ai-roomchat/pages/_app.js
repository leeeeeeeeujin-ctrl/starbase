import React, { useEffect } from 'react';
import Head from 'next/head';
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
  const onMaker = pathname.startsWith('/maker'); // 프롬프트 에디터 영역(채팅 오버레이 비활성화)
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
  // Register service worker for PWA (if supported)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        // defer to window load to avoid blocking initial paint
        const onLoad = () => {
          navigator.serviceWorker
            .register('/sw.js')
            .catch(() => {});
        };
        window.addEventListener('load', onLoad);
        return () => window.removeEventListener('load', onLoad);
      }
    } catch {}
  }, []);

  return (
    <GameIntegrationProvider>
      <Head>
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
