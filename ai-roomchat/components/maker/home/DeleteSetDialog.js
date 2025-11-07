"use client";

import { useEffect, useRef, useState } from 'react';

export default function DeleteSetDialog({
  open,
  setName,
  onConfirm,
  onCancel,
  busy = false,
  error = '',
  errorDetails = '',
}) {
  const [justOpened, setJustOpened] = useState(true);
  const bgRef = useRef(null);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    setJustOpened(true);
    const t = setTimeout(() => setJustOpened(false), 80);
    return () => clearTimeout(t);
  }, [open]);
  // Prevent unintended form submissions bubbling from ancestor forms
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      // Block Enter to avoid triggering any outer <form> submit handlers
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel?.();
      }
    };
    // capture phase to intercept before React/Next form handling
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onCancel]);
  useEffect(() => {
    if (!open) return;
    // reset details state on open
    setShowDetails(false);
    setCopied(false);
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
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                <div style={{ whiteSpace:'pre-wrap' }}>{error}</div>
                {errorDetails ? (
                  <div style={{ display:'flex', gap:6 }}>
                    <button type="button" onClick={()=>setShowDetails(v=>!v)} style={btnTiny}>
                      {showDetails ? '세부 숨기기' : '세부 보기'}
                    </button>
                    <button
                      type="button"
                      onClick={async()=>{
                        try {
                          await navigator.clipboard?.writeText(errorDetails);
                          setCopied(true);
                          setTimeout(()=>setCopied(false), 1200);
                        } catch {
                          try {
                            const ta = document.createElement('textarea');
                            ta.value = errorDetails;
                            ta.style.position = 'fixed';
                            ta.style.left = '-9999px';
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            document.body.removeChild(ta);
                            setCopied(true);
                            setTimeout(()=>setCopied(false), 1200);
                          } catch {}
                        }
                      }}
                      style={btnTiny}
                    >
                      {copied ? '복사됨' : '로그 복사'}
                    </button>
                  </div>
                ) : null}
              </div>
              {showDetails && errorDetails ? (
                <pre style={preDetails}>{errorDetails}</pre>
              ) : null}
            </div>
          ) : null}
        </div>
        <div style={footer}>
          <button type="button" onClick={onCancel} style={btnGhost}>취소</button>
          <button type="button" onClick={onConfirm} disabled={busy} style={btnDanger}>{busy?'삭제 중…':'삭제'}</button>
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
const btnTiny = { padding:'6px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#cbd5e1', fontSize:11 };
const preDetails = { marginTop:8, maxHeight:180, overflow:'auto', background:'#0b1220', border:'1px solid #334155', color:'#e2e8f0', borderRadius:8, padding:'8px 10px', whiteSpace:'pre-wrap', fontSize:11 };
