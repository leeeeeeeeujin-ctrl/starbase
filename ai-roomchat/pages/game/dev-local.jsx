"use client";

export default function LegacyLocalGameDevPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#111827', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
          Legacy Dev Route Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>로컬 게임 개발 프리뷰를 비활성화했습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#d1d5db' }}>
          이 페이지는 제거 예정인 구식 게임 런타임 실험 경로입니다.
          새 텍스트 배틀 실행기가 준비되기 전까지는 사용하지 않습니다.
        </p>
      </div>
    </div>
  );
}
