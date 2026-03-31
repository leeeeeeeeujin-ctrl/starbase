'use client';

import MobileTextBattlePlayer from './MobileTextBattlePlayer.jsx';

export default function MobileTextBattlePreviewOverlay({ definition, onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 140,
        background: 'rgba(15, 23, 42, 0.7)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px',
          color: '#f8fafc',
        }}
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#93c5fd' }}>
            Maker Preview
          </span>
          <strong style={{ fontSize: 18, lineHeight: 1.2 }}>모바일 텍스트 배틀 프리뷰</strong>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: '1px solid rgba(148, 163, 184, 0.35)',
            borderRadius: 999,
            background: 'rgba(15, 23, 42, 0.4)',
            color: '#f8fafc',
            padding: '10px 14px',
            fontWeight: 700,
          }}
        >
          닫기
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '0 16px calc(env(safe-area-inset-bottom) + 24px)',
        }}
      >
        <MobileTextBattlePlayer definition={definition} />
      </div>
    </div>
  );
}
