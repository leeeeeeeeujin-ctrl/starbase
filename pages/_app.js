try {
  if (typeof globalThis !== 'undefined') {
    if (typeof globalThis.__EXT_OPEN__ === 'undefined') globalThis.__EXT_OPEN__ = false;
    if (typeof globalThis.extensionsOpen === 'undefined') globalThis.extensionsOpen = globalThis.__EXT_OPEN__;
  }
} catch (_) {}

import ExtensionsHost from '../components/workspace/ExtensionsHost';
import { useEffect } from 'react';
import { ensureMonaco } from '../lib/monaco/ensure';

export default function MyApp({ Component, pageProps }) {
  useEffect(() => {
    ensureMonaco();

    // Monaco 관련 오류(특히 \"loader not initialized\")가 터질 때
    // 상세 정보를 남기기 위한 전역 핸들러
    function onRejection(e) {
      try {
        const reason = e?.reason;
        const msg = (reason && (reason.message || String(reason))) || '';
        if (msg && msg.toLowerCase().includes('monaco loader')) {
          // eslint-disable-next-line no-console
          console.error('[monaco] unhandledrejection (likely loader issue)', {
            message: msg,
            reason,
            hasEnsured: !!window.__monacoEnsured,
            hasLoaderConfigured: !!window.__monacoLoaderConfigured,
          });
        }
      } catch {
        // ignore
      }
    }

    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return (
    <>
      <Component {...pageProps} />
      <ExtensionsHost />
    </>
  );
}
