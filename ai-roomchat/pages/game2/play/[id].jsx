"use client";

import Link from 'next/link';

export default function LegacyGame2PlayPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#111827', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
          Legacy Route Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>이전 세대 게임 경로를 비활성화했습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#d1d5db' }}>
          `game2` 경로는 새 플랫폼 전환 과정에서 유지하지 않습니다.
          필요 기능은 새 텍스트 배틀 런타임으로 다시 들어갑니다.
        </p>
        <Link href="/maker" style={{ color: '#93c5fd' }}>
          메이커로 이동
        </Link>
      </div>
    </div>
  );
}
