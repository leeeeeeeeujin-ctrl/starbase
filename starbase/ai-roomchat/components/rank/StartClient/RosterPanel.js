function formatWinRate(value) {
  if (value === null || value === undefined) return '기록 없음'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '기록 없음'
  const ratio = numeric > 1 ? numeric : numeric * 100
  const rounded = Math.round(ratio * 10) / 10
  return `${rounded}%`
}

function formatBattles(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return '정보 없음'
  return `${numeric}전`
}

export default function RosterPanel({ participants = [] }) {
  return (
    <section
      style={{
        borderRadius: 18,
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: 'rgba(15, 23, 42, 0.6)',
        padding: 16,
        display: 'grid',
        gap: 14,
        color: '#e2e8f0',
      }}
    >
      <div style={{ fontWeight: 700 }}>참여자</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {participants.map((participant) => (
          <div
            key={participant.id || participant.hero_id || participant.hero?.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '68px 1fr',
              gap: 12,
              alignItems: 'stretch',
              padding: '12px 14px',
              borderRadius: 16,
              background: 'rgba(15, 23, 42, 0.58)',
              border: '1px solid rgba(148, 163, 184, 0.28)',
            }}
          >
            {participant.hero?.image_url ? (
              <img
                src={participant.hero.image_url}
                alt={participant.hero?.name || '참여자 이미지'}
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 16,
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 16,
                  background: 'rgba(148, 163, 184, 0.22)',
                }}
              />
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {participant.hero?.name || '이름 없음'}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.75)' }}>
                    역할: {participant.role || '미지정'} · 상태: {participant.status || '알 수 없음'}
                  </div>
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    fontSize: 12,
                    color: 'rgba(148, 163, 184, 0.9)',
                    display: 'grid',
                    gap: 2,
                  }}
                >
                  <span>점수 {Number.isFinite(Number(participant.score)) ? Number(participant.score) : '정보 없음'}</span>
                  <span>{formatBattles(participant.battles ?? participant.total_battles)}</span>
                  <span>승률 {formatWinRate(participant.win_rate ?? participant.winRate)}</span>
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'rgba(226, 232, 240, 0.7)',
                  display: 'grid',
                  gap: 4,
                  padding: 10,
                  borderRadius: 12,
                  background: 'rgba(15, 23, 42, 0.45)',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                }}
              >
                {[1, 2, 3, 4]
                  .map((index) => participant.hero?.[`ability${index}`])
                  .filter(Boolean)
                  .map((text, idx) => (
                    <div key={idx} style={{ lineHeight: 1.45 }}>
                      능력 {idx + 1}: {text}
                    </div>
                  ))}
                {participant.hero?.description ? (
                  <div style={{ lineHeight: 1.45 }}>설명: {participant.hero.description}</div>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        {participants.length === 0 && (
          <div style={{ color: 'rgba(226, 232, 240, 0.65)', fontSize: 13 }}>
            등록된 참여자가 없습니다.
          </div>
        )}
      </div>
    </section>
  )
}

//
