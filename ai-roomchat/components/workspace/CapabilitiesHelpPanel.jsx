"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useWorkspaceOptional } from './CodeWorkspaceProvider.jsx';
import { loadCapabilitiesMeta } from '../../lib/workspace/capabilitiesMeta.js';
import { computeRuntimeFeatureIssues } from '../../lib/runtime/runtimeFeatures.js';

const FILE_TEMPLATES = {
  '/graph/prompt-graph.json': JSON.stringify({
    nodes: [{ id: 'start', type: 'ai', label: 'Intro' }],
    edges: [],
  }, null, 2) + '\n',
  '/game/runtime.config.json': JSON.stringify({
    version: 1,
    entryNode: 'start',
    roles: ['players'],
    voteThreshold: 0.6667,
    durations: [30, 60, 90],
    ai: { model: 'gpt-4o-mini' },
  }, null, 2) + '\n',
  '/game/hooks/automation.js': [
    '// User automation hooks',
    'export function onUserAction(ctx, input) {',
    '  return null; // return next node id or { next }',
    '}',
    'export function selectNext(ctx, neighbors) {',
    '  return neighbors?.[0]?.id ?? null;',
    '}',
    'export function transformPrompt(ctx) {',
    '  const label = String(ctx?.node?.label || ctx?.node?.id || "");',
    '  return label;',
    '}',
    '',
  ].join('\n'),
  '/game/ui.shell.json': JSON.stringify({
    panels: {
      header: { enabled: true },
      gameChat: { enabled: true },
      nextBar: { enabled: true },
      playerChat: { enabled: true },
      widgets: { enabled: true, widgets: [] },
    },
  }, null, 2) + '\n',
  '/game/network.config.json': JSON.stringify({
    engine: 'socketio',
    url: 'https://example.com',
    token: '',
  }, null, 2) + '\n',
  '/world/tilemap.json': JSON.stringify({
    width: 5,
    height: 5,
    tileSize: 16,
    layers: [],
    tileset: null,
  }, null, 2) + '\n',
  '/world/entities.json': JSON.stringify({
    entities: [],
  }, null, 2) + '\n',
};

export default function CapabilitiesHelpPanel({ onClose }) {
  const [caps, setCaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [activeCaps, setActiveCaps] = useState([]);
  const [runtimeIssues, setRuntimeIssues] = useState([]);
  const [metaError, setMetaError] = useState('');
  const ws = useWorkspaceOptional();

  const handleCreateFile = async (path) => {
    try {
      if (!ws || typeof ws.addFile !== 'function') return;
      let key = String(path || '').trim();
      if (!key.startsWith('/')) key = `/${key}`;
      if (!key) return;
      // 이미 있으면 열기만 한다.
      const exists = ws.files && ws.files[key];
      if (!exists) {
        const content = FILE_TEMPLATES[key] || '\n';
        await ws.addFile(key, content, { readonly: false, dir: false });
      }
      if (typeof ws.open === 'function') ws.open(key);
    } catch (e) {
      try { console.warn('[CapabilitiesHelp] create file failed', e); } catch {}
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch('/api/runtime/capability-contracts');
        if (!alive) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const list = Array.isArray(j?.capabilities) ? j.capabilities : (Array.isArray(j?.contracts) ? j.contracts : []);
        setCaps(list);
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load selected capabilities and compute runtime feature issues for the current workspace (if available).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!ws || !ws.storageNamespace) {
          setActiveCaps([]);
          setRuntimeIssues([]);
          setMetaError('');
          return;
        }
        const meta = await loadCapabilitiesMeta(String(ws.storageNamespace)).catch(() => ({ capabilities: [] }));
        if (!alive) return;
        const sel = Array.isArray(meta?.capabilities) ? meta.capabilities : [];
        setActiveCaps(sel);
        setRuntimeIssues(computeRuntimeFeatureIssues({ capabilities: sel, files: ws.files || {} }));
        setMetaError('');
      } catch (e) {
        if (!alive) return;
        setActiveCaps([]);
        setRuntimeIssues([]);
        setMetaError(String(e?.message || e));
      }
    })();
    return () => { alive = false; };
  }, [ws?.storageNamespace, JSON.stringify(ws?.files || {})]);

  const list = useMemo(() => {
    const src = String(q || '').toLowerCase();
    if (!src) return caps;
    return caps.filter(c =>
      String(c.id).toLowerCase().includes(src) ||
      String(c.label).toLowerCase().includes(src) ||
      String(c.purpose||'').toLowerCase().includes(src)
    );
  }, [caps, q]);

  return (
    <div style={{ position:'fixed', right:16, top:16, bottom:16, width:420, zIndex:60, background:'#0b1220', border:'1px solid #334155', borderRadius:10, boxShadow:'0 6px 30px rgba(0,0,0,0.5)', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'10px 12px', borderBottom:'1px solid #25314a', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ fontWeight:700, color:'#e2e8f0' }}>Capabilities</div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="검색" style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#cbd5e1' }} />
        <button onClick={onClose} style={{ padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#111827', color:'#cbd5e1' }}>닫기</button>
      </div>
      <div style={{ padding:12, overflow:'auto' }}>
        {loading ? <div style={{ color:'#94a3b8' }}>불러오는 중…</div> : null}
        {error ? <div style={{ color:'#ef4444' }}>{error}</div> : null}
        {ws && ws.storageNamespace && (
          <div style={{ marginBottom:10, padding:'8px 10px', border:'1px solid #334155', borderRadius:8, background:'#0f172a' }}>
            <div style={{ color:'#e2e8f0', fontWeight:600, marginBottom:4 }}>현재 워크스페이스</div>
            {metaError ? (
              <div style={{ color:'#f87171' }}>메타 불러오기 실패: {metaError}</div>
            ) : (
              <>
                <div style={{ color:'#cbd5e1', fontSize:12, marginBottom:4 }}>
                  선택된 capability: {activeCaps.length ? activeCaps.join(', ') : '없음'}
                </div>
                {Array.isArray(runtimeIssues) && runtimeIssues.length > 0 ? (
                  <div style={{ 
                    marginTop: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(248,113,113,0.4)',
                    background: 'rgba(120,40,40,0.35)',
                    color:'#fca5a5',
                    fontSize:12
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: '#fee2e2' }}>
                      ⚠️ 비활성화된 기능 ({runtimeIssues.length}개)
                    </div>
                    <ul style={{ margin:'4px 0 0', paddingLeft:16 }}>
                      {runtimeIssues.map((it, idx) => (
                        <li key={`${it.id}-${idx}`} style={{ lineHeight:1.6, marginBottom: 8 }}>
                          <div style={{ fontWeight: 600, color:'#fca5a5', marginBottom: 4 }}>{it.id}</div>
                          {it.missingFiles?.length ? (
                            <div style={{ marginLeft: 8 }}>
                              <div style={{ color: '#fecaca', marginBottom: 2 }}>
                                📄 누락된 파일 ({it.missingFiles.length}개):
                              </div>
                              <ul style={{ margin: '2px 0 0', paddingLeft: 14 }}>
                                {it.missingFiles.map((f, i) => (
                                  <li key={`${f}-${i}`} style={{ 
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginBottom: 4,
                                    padding: '4px 6px',
                                    borderRadius: 6,
                                    background: 'rgba(15,23,42,0.5)'
                                  }}>
                                    <code style={{ 
                                      flex: 1,
                                      color: '#fbbf24',
                                      fontSize: 11 
                                    }}>{f}</code>
                                    {ws && typeof ws.addFile === 'function' ? (
                                      <button
                                        type="button"
                                        onClick={() => handleCreateFile(f)}
                                        style={{
                                          padding: '4px 10px',
                                          borderRadius: 6,
                                          border: '1px solid #065f46',
                                          background: '#064e3b',
                                          color: '#d1fae5',
                                          fontSize: 11,
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          flexShrink: 0
                                        }}
                                        title={`${f} 파일을 기본 템플릿으로 생성하고 편집기에서 엽니다`}
                                      >
                                        ✚ 생성
                                      </button>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {it.missingCaps?.length ? (
                            <div style={{ marginLeft: 8, marginTop: 4, color: '#fbbf24' }}>
                              🔌 필요한 capability: {it.missingCaps.join(', ')}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <div style={{ 
                      marginTop:10,
                      paddingTop: 8,
                      borderTop: '1px solid rgba(248,113,113,0.2)',
                      color:'#e5e7eb',
                      lineHeight: 1.5
                    }}>
                      <strong>도움말:</strong> <code style={{ color: '#fbbf24' }}>✚ 생성</code> 버튼을 클릭하면
                      기본 템플릿이 자동으로 생성되고 편집기에서 열립니다.
                      필요에 맞게 내용을 수정하세요.
                    </div>
                  </div>
                ) : (
                  <div style={{ 
                    marginTop: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(52,211,153,0.4)',
                    background: 'rgba(6,78,59,0.35)',
                    color:'#6ee7b7',
                    fontSize:12,
                    fontWeight: 600
                  }}>
                    ✓ 모든 선택된 기능의 필수 파일이 충족됨
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {!loading && !error && list.map((c) => (
          <div key={c.id} style={{ border:'1px solid #334155', borderRadius:8, marginBottom:10 }}>
            <div style={{ padding:'8px 10px', background:'#0f172a', borderBottom:'1px solid #25314a' }}>
              <div style={{ color:'#e2e8f0', fontWeight:600 }}>{c.label || c.id}</div>
              <div style={{ color:'#94a3b8', fontSize:12 }}>{c.id}</div>
            </div>
            <div style={{ padding:'10px' }}>
              {c.purpose ? <div style={{ marginBottom:8, color:'#cbd5e1' }}>{c.purpose}</div> : null}
              {Array.isArray(c.files) && c.files.length ? (
                <div style={{ marginBottom:6 }}>
                  <div style={{ fontWeight:600, color:'#e2e8f0', marginBottom:4 }}>Files</div>
                  <ul style={{ margin:0, paddingLeft:16 }}>
                    {c.files.map((f,i)=>(<li key={i} style={{ color:'#cbd5e1' }}><code>{f}</code></li>))}
                  </ul>
                </div>
              ) : null}
              {Array.isArray(c.hooks) && c.hooks.length ? (
                <div style={{ marginBottom:6 }}>
                  <div style={{ fontWeight:600, color:'#e2e8f0', marginBottom:4 }}>Hooks</div>
                  <div style={{ color:'#cbd5e1' }}>{c.hooks.join(', ')}</div>
                </div>
              ) : null}
              {Array.isArray(c.adapters) && c.adapters.length ? (
                <div style={{ marginBottom:6 }}>
                  <div style={{ fontWeight:600, color:'#e2e8f0', marginBottom:4 }}>Adapters</div>
                  <div style={{ color:'#cbd5e1' }}>{c.adapters.join(', ')}</div>
                </div>
              ) : null}
              {Array.isArray(c.references) && c.references.length ? (
                <div>
                  <div style={{ fontWeight:600, color:'#e2e8f0', marginBottom:4 }}>References</div>
                  <ul style={{ margin:0, paddingLeft:16 }}>
                    {c.references.map((r,i)=>(
                      <li key={i}><a href={r.href} target="_blank" rel="noreferrer" style={{ color:'#93c5fd' }}>{r.title || r.href}</a></li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
