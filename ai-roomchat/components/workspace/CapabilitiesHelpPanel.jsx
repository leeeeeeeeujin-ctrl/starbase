"use client";

import React, { useEffect, useMemo, useState } from 'react';

export default function CapabilitiesHelpPanel({ onClose }) {
  const [caps, setCaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

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
