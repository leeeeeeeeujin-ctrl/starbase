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
            key={participant.id || participant.hero_id}
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr',
              gap: 12,
              alignItems: 'start',
              padding: '10px 12px',
              borderRadius: 14,
              background: 'rgba(15, 23, 42, 0.55)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
            }}
          >
            {participant.hero?.image_url ? (
              <img
                src={participant.hero.image_url}
                alt={participant.hero?.name || '참여자 이미지'}
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 12,
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 12,
                  background: 'rgba(148, 163, 184, 0.25)',
                }}
              />
            )}
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontWeight: 700 }}>{participant.hero?.name || '이름 없음'}</div>
              <div style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.75)' }}>
                역할: {participant.role || '미지정'} · 상태: {participant.status}
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 12,
                  color: 'rgba(226, 232, 240, 0.7)',
                  display: 'grid',
                  gap: 2,
                }}
              >
                {[1, 2, 3, 4]
                  .map((index) => participant.hero?.[`ability${index}`])
                  .filter(Boolean)
                  .map((text, idx) => (
                    <li key={idx}>{text}</li>
                  ))}
              </ul>
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
