"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { GameRuntimeProvider, useGameRuntime } from '@/components/game/GameRuntimeProvider.jsx';
import { CodeWorkspaceProvider } from '@/components/workspace/CodeWorkspaceProvider.jsx';

const MainGameMobileUI = dynamic(() => import('@/components/game/MainGameMobileUI.jsx'), { ssr: false });

function Runner({ tpl }){
  const api = useGameRuntime();
  // derive graph from template.nodes/edges if present
  const graph = useMemo(() => {
    try {
      const nodes = Array.isArray(tpl?.nodes) ? tpl.nodes.map(n => ({ id: n.id, type: n.type || 'system', label: n.label || n.text || '' })) : [];
      const edges = Array.isArray(tpl?.edges) ? tpl.edges.map(e => ({ id: e.id || `${e.source}-${e.target}`, source: e.source, target: e.target, label: e.label || '' })) : [];
      return { nodes, edges };
    } catch { return { nodes: [], edges: [] }; }
  }, [tpl]);

  useEffect(() => {
    if (!tpl) return;
    api.setRuntime({ graph, hooks: {}, config: tpl?.runtime?.config || {}, files: {} });
  }, [tpl, graph, api]);

  return (
    <MainGameMobileUI
      template={tpl}
      runtimeFeed={api.aiMessages}
      runtimeSecondsLeft={api.secondsLeft}
      onForceNext={() => api.forceNext()}
      onPlayerChat={({ text }) => api.sendChat({ id:`c_${Date.now()}`, from:'player', to:'all', text, ts:Date.now() })}
    />
  );
}

export default function PlayByIdPage(){
  const router = useRouter();
  const { id } = router.query || {};
  const [tpl, setTpl] = useState(null);
  const [error, setError] = useState('');
  const [initFiles, setInitFiles] = useState(null);

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
  // Load server-first workspace set files for this set id
  useEffect(() => {
    let alive = true;
    if (!id) return;
    (async () => {
      try {
        const r = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`);
        if (!alive) return;
        if (r.ok) {
          const json = await r.json();
          setInitFiles(Array.isArray(json.files) ? json.files : []);
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, [id]);

  if (!id) return <div style={{ padding: 20 }}>게임 ID 확인 중…</div>;
  if (!tpl) return <div style={{ padding: 20 }}>불러오는 중…</div>;
  if (error) {
    return <div style={{ padding:20, color:'#b91c1c' }}>로드 오류: {error}</div>;
  }

  return (
    <CodeWorkspaceProvider key={id || 'default'} storageNamespace={id} initialFiles={initFiles || []}>
      <GameRuntimeProvider>
        <Runner tpl={tpl} />
      </GameRuntimeProvider>
    </CodeWorkspaceProvider>
  );
}
