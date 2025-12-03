"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useWorkspaceOptional } from './CodeWorkspaceProvider.jsx';
import { loadCapabilitiesMeta } from '../../lib/workspace/capabilitiesMeta.js';
import { computeRuntimeFeatureIssues } from '../../lib/runtime/runtimeFeatures.js';

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
      const key = String(path || '').trim();
      if (!key) return;
      // 이미 있으면 열기만 한다.
      const exists = ws.files && ws.files[key];
      if (!exists) await ws.addFile(key, '\n', { readonly: false, dir: false });
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
                  <div style={{ color:'#fca5a5', fontSize:12 }}>
                    필요한 항목이 없어 비활성화된 기능:
                    <ul style={{ margin:'4px 0 0', paddingLeft:16 }}>
                      {runtimeIssues.map((it, idx) => (
                        <li key={`${it.id}-${idx}`} style={{ lineHeight:1.4 }}>
                          <span style={{ color:'#f87171' }}>{it.id}</span>{' '}
                          {it.missingFiles?.length ? (
                            <div>
                              파일 없음:
                              <ul style={{ margin: '2px 0 0', paddingLeft: 14 }}>
                                {it.missingFiles.map((f, i) => (
                                  <li key={`${f}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <code>{f}</code>
                                    {ws && typeof ws.addFile === 'function' ? (
                                      <button
                                        type="button"
                                        onClick={() => handleCreateFile(f)}
                                        style={{
                                          padding: '2px 6px',
                                          borderRadius: 6,
                                          border: '1px solid #4b5563',
                                          background: '#020617',
                                          color: '#e5e7eb',
                                          fontSize: 10,
                                        }}
                                      >
                                        생성
                                      </button>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {it.missingCaps?.length ? (
                            <div>capability 누락: {it.missingCaps.join(', ')}</div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <div style={{ marginTop:6, color:'#cbd5e1' }}>
                      필요한 파일을 새로 만들려면 탭에서 <code>파일 추가</code> 후 위 경로대로 생성하세요.
                    </div>
                  </div>
                ) : (
                  <div style={{ color:'#34d399', fontSize:12 }}>모든 선택된 기능의 필수 파일이 충족됨</div>
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
