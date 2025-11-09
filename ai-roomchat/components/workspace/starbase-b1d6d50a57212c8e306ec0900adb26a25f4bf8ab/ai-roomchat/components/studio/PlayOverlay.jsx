"use client";

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useStudioTemplate } from '../../contexts/StudioStore';

const MainGameMobileUI = dynamic(() => import('@/components/game/MainGameMobileUI.jsx'), { ssr: false });

export default function PlayOverlay({ onClose }){
  const { templateText } = useStudioTemplate();
  const tpl = useMemo(() => {
    try { return JSON.parse(templateText || '{}'); } catch { return {}; }
  }, [templateText]);

  return (
    <div style={{ position:'fixed', inset:0, background:'#fff', zIndex:1000, display:'flex', flexDirection:'column' }}>
      <div style={{ position:'absolute', top:8, right:8, zIndex:1001 }}>
        <button onClick={onClose} style={{ padding:'8px 12px' }}>닫기</button>
      </div>
      <div style={{ flex:1, minHeight:0 }}>
        <MainGameMobileUI template={tpl} />
      </div>
    </div>
  );
}
