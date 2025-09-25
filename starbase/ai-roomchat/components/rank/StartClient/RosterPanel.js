export default function RosterPanel({ participants = [] }) {
  return (
    <section
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        background: '#fff',
        padding: 12,
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 700 }}>참여자</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {participants.map((participant) => (
          <div
            key={participant.id || participant.hero_id}
            style={{
              display: 'grid',
              gridTemplateColumns: '56px 1fr',
              gap: 10,
              alignItems: 'start',
            }}
          >
            {participant.hero?.image_url ? (
              <img
                src={participant.hero.image_url}
                alt={participant.hero?.name || '참여자 이미지'}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 10,
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 10,
                  background: '#e2e8f0',
                }}
              />
            )}
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontWeight: 700 }}>
                {participant.hero?.name || '이름 없음'}
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                역할: {participant.role || '미지정'} · 상태: {participant.status}
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 16,
                  fontSize: 12,
                  color: '#475569',
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
          <div style={{ color: '#94a3b8', fontSize: 13 }}>
            등록된 참여자가 없습니다.
          </div>
        )}
      </div>
    </section>
  )
}

//
