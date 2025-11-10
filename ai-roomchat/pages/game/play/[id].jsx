"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { GameRuntimeProvider, useGameRuntime } from '@/components/game/GameRuntimeProvider.jsx';
import WorkspaceFrame from '@/components/workspace/WorkspaceFrame.jsx';
import { useWorkspace } from '@/components/workspace/CodeWorkspaceProvider.jsx';
import { loadHooksFromSource } from '@/lib/runtime/safeEvalHookModule.js';

const MainGameMobileUI = dynamic(() => import('@/components/game/MainGameMobileUI.jsx'), { ssr: false });

function Runner({ tpl }){
  const api = useGameRuntime();
  const { files } = useWorkspace();
  // derive graph from template.nodes/edges if present
  const graph = useMemo(() => {
    // Prefer workspace graph
    try {
      const node = files?.['/graph/prompt-graph.json'];
      if (node && typeof node.content === 'string' && node.content.trim()) {
        const obj = JSON.parse(node.content);
        const nodes = Array.isArray(obj?.nodes) ? obj.nodes : [];
        const edges = Array.isArray(obj?.edges) ? obj.edges : [];
        return { nodes, edges };
      }
    } catch {}
    // Fallback to template
    try {
      const nodes = Array.isArray(tpl?.nodes) ? tpl.nodes.map(n => ({ id: n.id, type: n.type || 'system', label: n.label || n.text || '' })) : [];
      const edges = Array.isArray(tpl?.edges) ? tpl.edges.map(e => ({ id: e.id || `${e.source}-${e.target}`, source: e.source, target: e.target, label: e.label || '' })) : [];
      return { nodes, edges };
    } catch { return { nodes: [], edges: [] }; }
  }, [tpl, files]);

  useEffect(() => {
    if (!tpl) return;
    // hooks from workspace
    let hooks = {};
    try {
      const hnode = files?.['/game/hooks/automation.js'];
      const src = typeof hnode?.content === 'string' ? hnode.content : '';
      if (src.trim()) {
        hooks = loadHooksFromSource(src);
      }
    } catch {}
    // runtime config
    let config = tpl?.runtime?.config || {};
    try {
      const cnode = files?.['/game/runtime.config.json'];
      const raw = typeof cnode?.content === 'string' ? cnode.content : '';
      if (raw.trim()) config = JSON.parse(raw);
    } catch {}
    api.setRuntime({ graph, hooks, config, files: files || {} });
  }, [tpl, graph, files, api]);

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
        let r = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`);
        if (!alive) return;
        if (r.ok) {
          const json = await r.json();
          setInitFiles(Array.isArray(json.files) ? json.files : []);
          return;
        }
        if (r.status === 404) { setInitFiles([]); return; }
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
    <WorkspaceFrame id={id}>
      <GameRuntimeProvider>
        <Runner tpl={tpl} />
      </GameRuntimeProvider>
    </WorkspaceFrame>
  );
}
