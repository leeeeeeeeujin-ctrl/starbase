"use client";

import Link from 'next/link';

export default function LegacyAIGamePlayPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#111827', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
          Legacy Route Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>기존 AI 플레이 경로를 비활성화했습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#d1d5db' }}>
          이 경로는 구식 게임 엔진에 묶여 있어 유지하지 않습니다.
          새 텍스트 배틀 런타임이 들어오기 전까지는 열리지 않습니다.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/maker" style={{ color: '#f9fafb' }}>
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
