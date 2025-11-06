"use client";

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { CodeWorkspaceProvider, useWorkspace } from '@/components/workspace/CodeWorkspaceProvider.jsx';
import { GameRuntimeProvider, useGameRuntime } from '@/components/game/GameRuntimeProvider.jsx';

const MainGameMobileUI = dynamic(() => import('@/components/game/MainGameMobileUI.jsx'), { ssr: false });

function HooksLoader({ text }){
  // Very small sandbox: expose only an exports object
  return useMemo(() => {
    try {
      const src = String(text||'');
      const factory = new Function('exports', `${src}; return exports;`);
      const out = factory({});
      const allowed = ['onTurnStart','onUserAction','transformPrompt','selectNext'];
      const hooks = {};
      allowed.forEach(k => { if (typeof out[k] === 'function') hooks[k] = out[k]; });
      return hooks;
    } catch (e) {
      return {};
    }
  }, [text]);
}

function RuntimeControls(){
  const api = useGameRuntime();
  const [chat, setChat] = useState('');
  return (
    <div style={{ padding:10, borderTop:'1px solid #25314a' }}>
      <div style={{ display:'flex', gap:8 }}>
        <input value={chat} onChange={e=>setChat(e.target.value)} placeholder="메시지 입력 (user_action 중에 전송하면 다음으로 진행)" style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
        <button onClick={()=>{ api.sendChat({ id:`c_${Date.now()}`, from:'local', to:'all', text:chat, ts:Date.now() }); setChat(''); }} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #22c55e', background:'#0b1220', color:'#86efac' }}>전송</button>
        <button onClick={()=> api.forceNext()} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #7c3aed', background:'#0b1220', color:'#c4b5fd' }}>강제 다음</button>
      </div>
    </div>
  );
}

function DevGraphRunner(){
  const { files } = useWorkspace();
  const [encounterId, setEncounterId] = useState('sample');
  const [tplOverride, setTplOverride] = useState(null);
  const tplBase = useMemo(() => { try { return JSON.parse(String(files?.['/template.json']?.content || '{}')); } catch { return {}; } }, [files]);
  const tpl = useMemo(() => tplOverride || tplBase, [tplOverride, tplBase]);
  const graph = useMemo(() => { try { return JSON.parse(String(files?.['/graph/prompt-graph.json']?.content || '{"nodes":[],"edges":[]}')); } catch { return { nodes:[], edges:[] }; } }, [files]);
  const cfg = useMemo(() => { try { return JSON.parse(String(files?.['/game/runtime.config.json']?.content || '{}')); } catch { return {}; } }, [files]);
  const hooksText = String(files?.['/game/hooks/automation.js']?.content || '');
  const hooks = HooksLoader({ text: hooksText });
  const api = useGameRuntime();
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    // propagate on file updates
    api.setRuntime({ graph, hooks, config: cfg, files });
  }, [started, graph, hooks, cfg, files]);

  return (
    <div style={{ display:'grid', gridTemplateRows:'auto 1fr auto', height:'calc(var(--vh, 1vh) * 100)', background:'#0b1220' }}>
      <div style={{ padding:8, display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid #25314a', flexWrap:'wrap' }}>
        <button onClick={() => { api.setRuntime({ graph, hooks, config: cfg, files }); setStarted(true); }} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>런타임 시작</button>
        <div style={{ color:'#94a3b8', fontSize:12 }}>entryNode: <strong style={{ color:'#e2e8f0' }}>{cfg?.entryNode || (graph?.nodes?.[0]?.id || '없음')}</strong></div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ color:'#94a3b8', fontSize:12 }}>비실시간 캐릭터:</span>
          <input value={encounterId} onChange={e=>setEncounterId(e.target.value)} placeholder="/characters/<id>.json (id만 입력)" style={{ padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
          <button onClick={() => {
            try {
              const path = `/characters/${(encounterId||'').replace(/\/+/, '')}.json`;
              const raw = String(files?.[path]?.content || '');
              const ch = JSON.parse(raw || '{}');
              const base = tplBase || {};
              const chars = Array.isArray(base?.resources?.characters) ? base.resources.characters.slice() : [];
              const next = { ...base, resources: { ...(base.resources||{}), characters: [ch, ...chars] } };
              setTplOverride(next);
            } catch (e) { alert('캐릭터 로드 실패: ' + String(e?.message||e)); }
          }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #22c55e', background:'#0b1220', color:'#86efac' }}>불러오기</button>
          <button onClick={() => setTplOverride(null)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>해제</button>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:8, padding:8, minHeight:0 }}>
        <div style={{ minWidth:0, minHeight:0, border:'1px solid #25314a', borderRadius:12, overflow:'hidden' }}>
          <MainGameMobileUI
            template={tpl}
            runtimeFeed={api.aiMessages}
            runtimeSecondsLeft={api.secondsLeft}
            onForceNext={() => api.forceNext()}
            onPlayerChat={({ text }) => api.sendChat({ id:`c_${Date.now()}`, from:'local', to:'all', text, ts:Date.now() })}
          />
        </div>
        <div style={{ display:'flex', flexDirection:'column', minWidth:0, minHeight:0, border:'1px solid #25314a', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:8, background:'rgba(2,6,23,0.6)', color:'#e2e8f0', fontWeight:700 }}>런타임 피드</div>
          <div style={{ flex:1, minHeight:0, overflow:'auto', padding:8 }}>
            {api.aiMessages.length === 0 ? (
              <div style={{ color:'#94a3b8', fontSize:12 }}>메시지가 없습니다.</div>
            ) : api.aiMessages.map(m => (
              <div key={m.id} style={{ marginBottom:10, padding:10, background:'rgba(14,165,233,0.08)', border:'1px solid rgba(148,163,184,0.25)', borderRadius:8, color:'#e2e8f0' }}>
                <div style={{ fontSize:11, color:'#94a3b8' }}>{new Date(m.ts).toLocaleTimeString()} • scope: {m.roleScope}</div>
                <div style={{ whiteSpace:'pre-wrap' }}>{m.text}</div>
              </div>
            ))}
          </div>
          <RuntimeControls />
        </div>
      </div>
    </div>
  );
}

export default function DevGraphPage(){
  const [enableRealtime, setEnableRealtime] = useState(true);
  const [enableBroadcast, setEnableBroadcast] = useState(true);
  useEffect(() => {
    try {
      const setVh = () => { const vh = window.innerHeight * 0.01; document.documentElement.style.setProperty('--vh', `${vh}px`); };
      setVh(); window.addEventListener('resize', setVh); return () => window.removeEventListener('resize', setVh);
    } catch {}
  }, []);

  return (
    <CodeWorkspaceProvider>
      <div style={{ position:'fixed', right:10, top:10, zIndex:10, display:'flex', gap:10, background:'rgba(2,6,23,0.8)', border:'1px solid #25314a', borderRadius:10, padding:'6px 10px' }}>
        <label style={{ color:'#e2e8f0', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
          <input type="checkbox" checked={enableRealtime} onChange={(e)=>setEnableRealtime(e.target.checked)} /> Realtime
        </label>
        <label style={{ color:'#e2e8f0', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
          <input type="checkbox" checked={enableBroadcast} onChange={(e)=>setEnableBroadcast(e.target.checked)} /> Cross-tab
        </label>
      </div>
      <GameRuntimeProvider enableRealtime={enableRealtime} enableBroadcast={enableBroadcast}>
        <DevGraphRunner />
      </GameRuntimeProvider>
    </CodeWorkspaceProvider>
  );
}
