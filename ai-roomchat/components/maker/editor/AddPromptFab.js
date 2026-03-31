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
          <button type="button" style={{ ...btn, background: '#eef2ff', color: '#3730a3', borderColor: '#c7d2fe' }} onClick={() => { onAdd?.('ai',''); setOpen(false); }}>
            AI 실행 노드
            <div style={{ marginTop: 4, fontSize: 11, fontWeight: 500, color: 'rgba(55,48,163,0.72)' }}>캐릭터 AI나 판정 AI에 고정 프롬프트를 보냅니다</div>
          </button>
          <button type="button" style={{ ...btn, background: '#e0f2fe', color: '#075985', borderColor: '#bae6fd' }} onClick={() => { onAdd?.('user_action',''); setOpen(false); }}>
            유저 응답 노드
            <div style={{ marginTop: 4, fontSize: 11, fontWeight: 500, color: 'rgba(7,89,133,0.78)' }}>텍스트나 선택을 받아 다음 분기에 씁니다</div>
          </button>
        </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          title="실행 노드 추가"
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
