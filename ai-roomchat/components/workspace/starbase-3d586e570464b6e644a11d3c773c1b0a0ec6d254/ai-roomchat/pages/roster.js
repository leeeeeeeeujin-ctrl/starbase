'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';

import RosterContainer from '../components/roster/RosterContainer';
import { isStandaloneDisplay, minutesLeftForBypass } from '../lib/pwa/installGate';

export default function RosterPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      const standalone = isStandaloneDisplay();
      const bypassLeft = minutesLeftForBypass();
      if (!standalone && bypassLeft <= 0) {
        const path = window.location.pathname + window.location.search;
        const next = path || '/roster';
        router.replace(`/pwa/install?next=${encodeURIComponent(next)}`);
      }
    } catch {
      // ignore gating errors
    }
  }, [router]);

  return <RosterContainer />;
}
