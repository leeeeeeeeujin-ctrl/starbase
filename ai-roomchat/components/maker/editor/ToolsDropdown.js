"use client";

import { useState, useRef, useEffect } from 'react';

// Define styles before component to avoid any TDZ surprises after bundling
const itemStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid transparent',
  background: 'transparent',
  color: '#e2e8f0',
  fontSize: 12,
  fontWeight: 600,
};

export default function ToolsDropdown({ onOpenCode, onOpenUiSettings, onOpenDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = e => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          padding: '6px 10px',
          borderRadius: 10,
          border: '1px solid rgba(148,163,184,.35)',
          background: 'rgba(255,255,255,.06)',
          color: '#e2e8f0',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        도구 ▾
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '110%',
            minWidth: 220,
            background: '#0b1220',
            border: '1px solid rgba(148,163,184,.35)',
            borderRadius: 10,
            padding: 6,
            boxShadow: '0 10px 24px rgba(2,6,23,.35)',
            zIndex: 40,
          }}
        >
          <button onClick={onOpenCode} style={itemStyle}>코드 에디터</button>
          <div style={{ height: 1, background: 'rgba(148,163,184,0.25)', margin: '4px 2px' }} />
          <button onClick={onOpenUiSettings} style={itemStyle}>UI 설정</button>
          <div style={{ height: 1, background: 'rgba(148,163,184,0.25)', margin: '4px 2px' }} />
          <button
            onClick={onOpenDelete}
            style={{
              ...itemStyle,
              color: '#fecaca',
              borderColor: 'transparent',
            }}
          >세트 삭제…</button>
        </div>
      )}
    </div>
  );
}
