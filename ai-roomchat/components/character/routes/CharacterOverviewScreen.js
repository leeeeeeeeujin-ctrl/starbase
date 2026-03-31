'use client';

export default function CharacterOverviewScreen({ hero }) {
  const abilities = [hero?.ability1, hero?.ability2, hero?.ability3, hero?.ability4]
    .map(value => String(value || '').trim())
    .filter(Boolean);

  return (
    <>
      <section
        style={{
          display: 'grid',
          gap: 14,
          padding: 16,
          borderRadius: 24,
          background: 'rgba(2, 6, 23, 0.78)',
          border: '1px solid rgba(148, 163, 184, 0.22)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 220px) minmax(0, 1fr)',
            gap: 16,
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              minHeight: 280,
              borderRadius: 22,
              overflow: 'hidden',
              background: 'rgba(15,23,42,0.85)',
              border: '1px solid rgba(148,163,184,0.24)',
            }}
          >
            {hero?.image_url ? (
              <img
                src={hero.image_url}
                alt={hero?.name || '캐릭터 이미지'}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#94a3b8', fontWeight: 800 }}>
                이미지 없음
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <strong style={{ fontSize: 28, lineHeight: 1.2 }}>{hero?.name || '이름 없는 캐릭터'}</strong>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>
                캐릭터 카드와 기본 정보를 확인하는 화면입니다.
              </span>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 18,
                background: 'rgba(15,23,42,0.72)',
                border: '1px solid rgba(148,163,184,0.2)',
                fontSize: 14,
                lineHeight: 1.7,
                color: '#e2e8f0',
                whiteSpace: 'pre-line',
              }}
            >
              {hero?.description?.trim() || '설명이 아직 없습니다.'}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <MetaPill label="배경" value={hero?.background_url ? '설정됨' : '없음'} />
              <MetaPill label="브금" value={hero?.bgm_url ? '설정됨' : '없음'} />
              <MetaPill label="능력" value={abilities.length ? `${abilities.length}개` : '없음'} />
            </div>
          </div>
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
        <strong style={{ fontSize: 16 }}>능력</strong>
        {abilities.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {abilities.map((ability, index) => (
              <div
                key={`${ability}-${index}`}
                style={{
                  padding: '12px 14px',
                  borderRadius: 16,
                  background: 'rgba(15,23,42,0.68)',
                  border: '1px solid rgba(148,163,184,0.18)',
                  fontSize: 14,
                  color: '#e2e8f0',
                }}
              >
                <span style={{ color: '#7dd3fc', fontWeight: 800, marginRight: 8 }}>{index + 1}</span>
                {ability}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>등록된 능력이 없습니다.</div>
        )}
      </section>
    </>
  );
}

function MetaPill({ label, value }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 16,
        background: 'rgba(15,23,42,0.7)',
        border: '1px solid rgba(148,163,184,0.2)',
        display: 'grid',
        gap: 4,
        minWidth: 92,
      }}
    >
      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#f8fafc', fontWeight: 700 }}>{value}</span>
    </div>
  );
}
