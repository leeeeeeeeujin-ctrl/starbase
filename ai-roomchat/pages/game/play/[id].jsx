"use client";

import Link from 'next/link';

export default function LegacyGamePlayPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Route Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>이 게임 실행 경로는 정리 중입니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          기존 게임 런타임은 제거 대상이라 이 페이지에서 더 이상 실행하지 않습니다.
          메이커 중심의 새 텍스트 배틀 실행 흐름으로 교체하는 중입니다.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/maker" style={{ color: '#f8fafc' }}>
            메이커로 이동
          </Link>
          <Link href="/match" style={{ color: '#93c5fd' }}>
            매치 화면으로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
