"use client";

export default function LegacyGraphGameDevPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Dev Route Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>그래프 기반 게임 개발 페이지를 비활성화했습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          기존 그래프 런타임 실험 경로는 더 이상 기준선이 아닙니다.
          메이커에서 정의한 턴 흐름을 기준으로 새 실행기를 다시 붙일 예정입니다.
        </p>
      </div>
    </div>
  );
}
