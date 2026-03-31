"use client";

export default function PlayOverlay({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1001 }}>
        <button onClick={onClose} style={{ padding: '8px 12px' }}>닫기</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: 32, background: '#020617', color: '#e2e8f0' }}>
        <div style={{ maxWidth: 560, display: 'grid', gap: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
            Legacy Play Disabled
          </div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            스튜디오 플레이 프리뷰는 비활성화되었습니다.
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: '#cbd5e1' }}>
            스튜디오 계층은 레거시로 분리했고, 새 텍스트 배틀 프리뷰는 메이커 안에서 바로 실행됩니다.
          </div>
        </div>
      </div>
    </div>
  );
}
