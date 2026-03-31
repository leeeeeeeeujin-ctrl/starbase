"use client";

import Link from 'next/link';

export default function LegacyMobileGamePage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#020617', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Route Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>모바일 게임 미리보기는 중단되었습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          현재 모바일 게임 프리뷰는 레거시 UI에 의존하고 있어 비활성화했습니다.
          이후 새 실행환경이 준비되면 이 경로도 그 기준으로 다시 연결합니다.
        </p>
        <Link href="/maker" style={{ color: '#93c5fd' }}>
          메이커로 이동
        </Link>
      </div>
    </div>
  );
}
