import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { isStandaloneDisplay, minutesLeftForBypass, shouldGate } from '@/lib/pwa/installGate';

export default function InstallGate() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const asPath = router.asPath || router.pathname || '/';
    const isStandalone = isStandaloneDisplay();
    const url = new URL(window.location.href);
    const allowBrowser = url.searchParams.get('allowBrowser') === '1';

    const now = Date.now();
    if (allowBrowser) {
      // allow temporary bypass for 60 minutes
      try { localStorage.setItem('ALLOW_BROWSER_TEMP', JSON.stringify({ expiresAt: now + 60 * 60000 })); } catch {}
    }

    const hasBypass = minutesLeftForBypass(now) > 0;
    if (shouldGate(asPath, isStandalone, hasBypass ? 1 : 0)) {
      const next = encodeURIComponent(asPath);
      if (asPath.startsWith('/pwa/install')) return; // avoid loop
      router.replace(`/pwa/install?next=${next}`);
    }
  }, [router]);

  return null;
}
