"use client";

import { useEffect, useRef, useState } from "react";

export default function AutoUpdateListener({ intervalMs = 60000, auto = false }) {
  const [current, setCurrent] = useState(null);
  const timerRef = useRef(null);

  async function fetchVersion() {
    try {
      const res = await fetch('/api/app/version', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.version || null;
    } catch {
      return null;
    }
  }

  async function check() {
    const v = await fetchVersion();
    if (!v) return;
    if (!current) {
      setCurrent(v);
      try { localStorage.setItem('app:version', v); } catch {}
      return;
    }
    if (v !== current) {
      // 새 배포 감지됨
      try { localStorage.setItem('app:version', v); } catch {}
      if (auto || String(process.env.NEXT_PUBLIC_FORCE_AUTO_UPDATE || '') === 'true') {
        window.location.reload();
      } else {
        const ok = confirm('새 업데이트가 있습니다. 지금 새로고침할까요?');
        if (ok) window.location.reload();
      }
    }
  }

  useEffect(() => {
    let disposed = false;
    (async () => { if (!disposed) await check(); })();
    timerRef.current = setInterval(check, Math.max(15000, intervalMs));
    return () => { disposed = true; clearInterval(timerRef.current); };
  }, [intervalMs, auto, current]);

  return null;
}

