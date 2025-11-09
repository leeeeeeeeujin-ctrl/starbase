"use client";

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

const MainGameMobileUI = dynamic(() => import('@/components/game/MainGameMobileUI.jsx'), { ssr: false });

export default function MobileGamePage(){
  const [tpl, setTpl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = new URL(window.location.href);
        const tplUrl = url.searchParams.get('tpl');
        if (tplUrl) {
          const res = await fetch(tplUrl);
          const obj = await res.json();
          if (!alive) return;
          setTpl(obj);
        } else {
          // Fallback: minimal template
          setTpl({ nodes: [], edges: [], resources: { files: [] } });
        }
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
        setTpl({ nodes: [], edges: [], resources: { files: [] } });
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!tpl) return <div style={{ padding: 20 }}>불러오는 중…</div>;
  if (error) {
    return <div style={{ padding:20, color:'#b91c1c' }}>로드 오류: {error}</div>;
  }

  return <MainGameMobileUI template={tpl} />;
}
