"use client";

import { useState } from 'react';

export default function AddPromptFab({ onAdd }) {
  const [open, setOpen] = useState(false);
  const btn = {
    padding: '11px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,.35)',
    background: '#ffffff',
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 700,
    boxShadow: '0 18px 36px -28px rgba(15, 23, 42, 0.4)',
    textAlign: 'left',
    minWidth: 152,
  };
  return (
    <div data-overlay="prompt-fab" style={{ position: 'fixed', right: 24, bottom: 18, zIndex: 240 }}>
      <div style={{ position: 'relative', width: 58, height: 58 }}>
        {open && (
        <div style={{ position: 'absolute', right: 0, bottom: 68, display: 'grid', gap: 8 }}>
          <button style={{ ...btn, background: '#eef2ff', color: '#3730a3', borderColor: '#c7d2fe' }} onClick={() => { onAdd?.('ai',''); setOpen(false); }}>AI 턴 추가</button>
          <button style={{ ...btn, background: '#e0f2fe', color: '#075985', borderColor: '#bae6fd' }} onClick={() => { onAdd?.('user_action',''); setOpen(false); }}>유저 입력 턴 추가</button>
          <button style={{ ...btn, background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' }} onClick={() => { onAdd?.('system',''); setOpen(false); }}>시스템 턴 추가</button>
        </div>
        )}
        <button
          onClick={() => setOpen(v => !v)}
          title="턴 추가"
          style={{
            width: 58,
            height: 58,
            borderRadius: 999,
            border: 'none',
            background: open ? '#1d4ed8' : '#0f172a',
            color: '#f8fafc',
            fontWeight: 800,
            fontSize: 28,
            boxShadow: '0 26px 54px -28px rgba(15, 23, 42, 0.72)',
          }}
        >＋</button>
      </div>
    </div>
  );
}
