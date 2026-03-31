'use client';

import Link from 'next/link';

export default function CharacterPlayScreen({ hero, appearances = [] }) {
  return (
    <>
      <section
        style={{
          padding: 16,
          borderRadius: 24,
          background: 'rgba(2, 6, 23, 0.78)',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          display: 'grid',
          gap: 12,
        }}
      >
        <strong style={{ fontSize: 18 }}>통계 · 게임 시작</strong>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <StatCard label="캐릭터 이름" value={hero?.name || '이름 없음'} />
          <StatCard label="참여 게임" value={String(appearances.length)} />
          <StatCard
            label="업데이트"
            value={hero?.updated_at ? new Date(hero.updated_at).toLocaleDateString('ko-KR') : '-'}
          />
        </div>
      </section>

      <section
        style={{
          padding: 16,
          borderRadius: 24,
          background: 'rgba(2, 6, 23, 0.78)',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          display: 'grid',
          gap: 12,
        }}
      >
        <strong style={{ fontSize: 16 }}>참여 게임</strong>
        {appearances.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {appearances.map(entry => (
              <Link
                key={`${entry.gameId || 'none'}-${entry.id || 'row'}`}
                href={entry.gameId ? `/rank/${entry.gameId}` : '#'}
                style={{
                  textDecoration: 'none',
                  padding: '12px 14px',
                  borderRadius: 18,
                  background: 'rgba(15,23,42,0.72)',
                  border: '1px solid rgba(148,163,184,0.2)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                  color: '#e2e8f0',
                }}
              >
                <div style={{ display: 'grid', gap: 4 }}>
                  <strong style={{ fontSize: 14 }}>{entry.gameName || '비공개 게임'}</strong>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    슬롯 {entry.slotNo ?? '-'}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: '#7dd3fc', fontWeight: 800 }}>열기</span>
              </Link>
            ))}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>참여한 게임이 아직 없습니다.</div>
        )}
      </section>
    </>
  );
}

function StatCard({ label, value }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 18,
        background: 'rgba(15,23,42,0.72)',
        border: '1px solid rgba(148,163,184,0.2)',
        display: 'grid',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 800 }}>{label}</span>
      <strong style={{ fontSize: 16, color: '#f8fafc', lineHeight: 1.4 }}>{value}</strong>
    </div>
  );
}
