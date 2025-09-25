import { baseCardStyle } from './utils'

export function HighlightCard({ hero, stats, onInvite, onWhisper, onProfile, gameId, heroId }) {
  if (!hero) return null

  return (
    <section
      style={{
        ...baseCardStyle,
        borderRadius: 28,
        background: 'linear-gradient(135deg, rgba(15,118,110,0.92) 0%, rgba(30,64,175,0.88) 100%)',
        boxShadow: '0 38px 80px -48px rgba(8, 47, 73, 0.65)',
        gap: 18,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>이번 주 1위</span>
          <h2 style={{ margin: 0, fontSize: 26 }}>{hero.name}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onInvite ? (
            <button
              type="button"
              onClick={() => onInvite({ heroId, heroName: hero.name, gameId })}
              style={{
                padding: '10px 16px',
                borderRadius: 999,
                border: '1px solid rgba(191, 219, 254, 0.35)',
                background: 'rgba(15, 23, 42, 0.35)',
                color: '#f8fafc',
                fontWeight: 600,
              }}
            >
              실시간 초대
            </button>
          ) : null}
          {onWhisper ? (
            <button
              type="button"
              onClick={() => onWhisper({ heroId, heroName: hero.name, gameId })}
              style={{
                padding: '10px 16px',
                borderRadius: 999,
                border: 'none',
                background: '#38bdf8',
                color: '#0f172a',
                fontWeight: 800,
              }}
            >
              귓속말 보내기
            </button>
          ) : null}
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 20, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() =>
            onProfile?.({
              heroId,
              heroName: hero.name,
              avatarUrl: hero.image_url || null,
              gameId,
              isSelf: false,
            })
          }
          style={{
            width: 110,
            height: 110,
            borderRadius: 28,
            overflow: 'hidden',
            border: '2px solid rgba(244, 244, 245, 0.45)',
            background: 'rgba(15, 23, 42, 0.45)',
            padding: 0,
            cursor: heroId ? 'pointer' : 'default',
          }}
        >
          {hero.image_url ? (
            <img src={hero.image_url} alt={hero.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
              }}
            >
              🛡
            </div>
          )}
        </button>

        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 12,
          }}
        >
          <li
            style={{
              borderRadius: 18,
              padding: 14,
              background: 'rgba(15, 23, 42, 0.35)',
              display: 'grid',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12, opacity: 0.75 }}>최근 Elo</span>
            <strong style={{ fontSize: 22 }}>{stats?.rating ?? '—'}</strong>
          </li>
          <li
            style={{
              borderRadius: 18,
              padding: 14,
              background: 'rgba(15, 23, 42, 0.35)',
              display: 'grid',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12, opacity: 0.75 }}>승률</span>
            <strong style={{ fontSize: 22 }}>{stats?.winRate ?? '—'}%</strong>
          </li>
          <li
            style={{
              borderRadius: 18,
              padding: 14,
              background: 'rgba(15, 23, 42, 0.35)',
              display: 'grid',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12, opacity: 0.75 }}>전투수</span>
            <strong style={{ fontSize: 22 }}>{stats?.total ?? 0}</strong>
          </li>
        </ul>
      </div>
    </section>
  )
}

//
