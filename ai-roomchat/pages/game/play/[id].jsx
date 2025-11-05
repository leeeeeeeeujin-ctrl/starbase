"use client";

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';

const MainGameMobileUI = dynamic(() => import('@/components/game/MainGameMobileUI.jsx'), { ssr: false });

export default function PlayByIdPage(){
  const router = useRouter();
  const { id } = router.query || {};
  const [tpl, setTpl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/game/register?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const url = data?.url || null;
        if (!alive) return;
        if (url) {
          const r2 = await fetch(url);
          const obj = await r2.json();
          if (!alive) return;
          setTpl(obj || { nodes: [], edges: [], resources: { files: [] } });
        } else {
          setTpl({ nodes: [], edges: [], resources: { files: [] } });
        }
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
        setTpl({ nodes: [], edges: [], resources: { files: [] } });
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (!id) return <div style={{ padding: 20 }}>게임 ID 확인 중…</div>;
  if (!tpl) return <div style={{ padding: 20 }}>불러오는 중…</div>;
  if (error) {
    return <div style={{ padding:20, color:'#b91c1c' }}>로드 오류: {error}</div>;
  }

  return <MainGameMobileUI template={tpl} />;
}
