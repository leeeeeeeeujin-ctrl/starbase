// components/rank/MyHeroStrip.js
export default function MyHeroStrip({ hero, roleLabel }) {
  if (!hero) {
    return (
      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 12,
          background: '#fafafa',
          color: '#64748b',
        }}
      >
        캐릭터를 선택한 뒤 입장해야 합니다. (선택값이 없어요)
      </div>
    );
  }
  const abilities = [hero.ability1, hero.ability2, hero.ability3, hero.ability4].filter(Boolean);

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 12,
            overflow: 'hidden',
            background: '#e5e7eb',
            flex: '0 0 auto',
          }}
        >
          {hero.image_url && (
            <img
              src={hero.image_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 18,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {hero.name}
          </div>
          {roleLabel && (
            <div style={{ marginTop: 2, fontSize: 12, fontWeight: 700, color: '#334155' }}>
              내 역할: {roleLabel}
            </div>
          )}
          <div style={{ color: '#64748b', marginTop: 4, whiteSpace: 'pre-wrap' }}>
            {hero.description || '설명 없음'}
          </div>
        </div>
      </div>

      {abilities.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>능력</div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'grid',
              gap: 6,
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))',
            }}
          >
            {abilities.map((a, idx) => (
              <li
                key={idx}
                style={{
                  border: '1px solid #eef2f7',
                  borderRadius: 10,
                  padding: '8px 10px',
                  background: '#fafafa',
                }}
              >
                <span style={{ fontWeight: 700, marginRight: 6 }}>#{idx + 1}</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
