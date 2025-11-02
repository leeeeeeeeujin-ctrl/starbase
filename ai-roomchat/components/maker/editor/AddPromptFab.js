"use client";

import { useState } from 'react';

export default function AddPromptFab({ onAdd }) {
  const [open, setOpen] = useState(false);
  const btn = {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,.35)',
    background: '#0b1220',
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 700,
  };
  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 240 }}>
      {open && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
          <button style={{ ...btn, background: '#eef2ff', color: '#3730a3', borderColor: '#c7d2fe' }} onClick={() => { onAdd?.('ai',''); setOpen(false); }}>+ AI 프롬프트</button>
          <button style={{ ...btn, background: '#e0f2fe', color: '#075985', borderColor: '#bae6fd' }} onClick={() => { onAdd?.('user_action',''); setOpen(false); }}>+ 유저 행동</button>
          <button style={{ ...btn, background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' }} onClick={() => { onAdd?.('system',''); setOpen(false); }}>+ 시스템</button>
        </div>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        title="프롬프트 추가"
        style={{ width: 48, height: 48, borderRadius: 24, border: '1px solid rgba(148,163,184,.35)', background: '#0f172a', color: '#e2e8f0', fontWeight: 800 }}
      >＋</button>
    </div>
  );
}
