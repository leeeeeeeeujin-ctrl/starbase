"use client";

import dynamic from 'next/dynamic';
import { useEffect, useMemo } from 'react';
import { CodeWorkspaceProvider, useWorkspace } from '@/components/workspace/CodeWorkspaceProvider.jsx';

const MainGameMobileUI = dynamic(() => import('@/components/game/MainGameMobileUI.jsx'), { ssr: false });

function LocalTemplateRunner(){
  const { files } = useWorkspace();
  const tpl = useMemo(() => {
    try {
      const txt = String(files?.['/template.json']?.content || '{}');
      return JSON.parse(txt || '{}');
    } catch {
      return {};
    }
  }, [files]);

  return <MainGameMobileUI template={tpl} />;
}

export default function DevLocalGamePage(){
  // Ensure mobile-friendly viewport sizing
  useEffect(() => {
    try {
      const setVh = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      };
      setVh();
      window.addEventListener('resize', setVh);
      return () => window.removeEventListener('resize', setVh);
    } catch {}
  }, []);

  return (
    <div style={{ height: 'calc(var(--vh, 1vh) * 100)', background:'#0b1220' }}>
      <CodeWorkspaceProvider>
        <LocalTemplateRunner />
      </CodeWorkspaceProvider>
    </div>
  );
}
