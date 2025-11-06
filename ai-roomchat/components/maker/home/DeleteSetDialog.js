"use client";

import { useEffect, useRef, useState } from 'react';

export default function DeleteSetDialog({
  open,
  setName,
  onConfirm,
  onCancel,
  busy = false,
  error = '',
}) {
  const [justOpened, setJustOpened] = useState(true);
  const bgRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    setJustOpened(true);
    const t = setTimeout(() => setJustOpened(false), 80);
    return () => clearTimeout(t);
  }, [open]);
  if (!open) return null;
  return (
    <div style={backdrop}>
      <div ref={bgRef} onClick={() => { if (!justOpened) onCancel?.(); }} style={bgCover} />
      <div role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()} style={panel}>
        <div style={header}>
          <strong style={{ color:'#e2e8f0' }}>세트 삭제</strong>
        </div>
        <div style={{ display:'grid', gap:10, color:'#cbd5e1' }}>
          <div>
            <div style={{ fontSize:13 }}>아래 세트를 삭제할까요?</div>
            <div style={{ marginTop:6, fontWeight:800, color:'#e2e8f0' }}>{setName || '이름 없음'}</div>
            <div style={{ marginTop:10, fontSize:12, color:'#94a3b8' }}>
              삭제 시 되돌릴 수 없습니다. 게임에 등록된 세트는 삭제할 수 없습니다.
            </div>
          </div>
          {error ? (
            <div style={errorBox}>
              {error}
            </div>
          ) : null}
        </div>
        <div style={footer}>
          <button onClick={onCancel} style={btnGhost}>취소</button>
          <button onClick={onConfirm} disabled={busy} style={btnDanger}>{busy?'삭제 중…':'삭제'}</button>
        </div>
      </div>
    </div>
  );
}

const backdrop = { position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center' };
const bgCover = { position:'absolute', inset:0, background:'rgba(2,6,23,0.65)' };
const panel = { position:'relative', width:'min(520px, 92vw)', background:'#0b1220', border:'1px solid #334155', borderRadius:12, boxShadow:'0 24px 64px rgba(0,0,0,0.6)', padding:12, display:'grid', gap:12 };
const header = { padding:'4px 6px', borderBottom:'1px solid #25314a' };
const footer = { display:'flex', justifyContent:'flex-end', gap:8, borderTop:'1px solid #25314a', paddingTop:10 };
const btnGhost = { padding:'8px 12px', borderRadius:10, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' };
const btnDanger = { padding:'8px 12px', borderRadius:10, border:'1px solid #7f1d1d', background:'#7f1d1d', color:'#fecaca', fontWeight:800 };
const errorBox = { padding:'8px 10px', border:'1px solid #fecaca', background:'#3f1d1d', color:'#fecaca', borderRadius:8, fontSize:12 };
