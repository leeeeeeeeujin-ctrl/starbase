export function GameSection({ section, onInvite, onWhisper, onProfile }) {
  return (
    <li
      style={{
        borderRadius: 20,
        padding: 16,
        background: 'rgba(15, 23, 42, 0.55)',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            overflow: 'hidden',
            background: 'rgba(15, 23, 42, 0.45)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
          }}
        >
          {section.game?.image_url ? (
            <img src={section.game.image_url} alt={section.game?.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              🎮
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gap: 2 }}>
          <strong style={{ fontSize: 15 }}>{section.game?.name || '이름 없는 게임'}</strong>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            상위 <span data-numeric>{section.rows.length}</span>명
          </span>
        </div>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {section.rows.map((entry, index) => (
          <li
            key={entry.id || `${entry.heroId}-${index}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: '10px 12px',
              borderRadius: 16,
              background: 'rgba(30, 41, 59, 0.55)',
            }}
          >
            <button
              type="button"
              onClick={() =>
                onProfile?.({
                  heroId: entry.heroId,
                  heroName: entry.hero?.name,
                  avatarUrl: entry.hero?.image_url || null,
                  gameId: entry.game_id,
                  isSelf: false,
                })
              }
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                overflow: 'hidden',
                background: 'rgba(15, 23, 42, 0.45)',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                padding: 0,
                cursor: entry.heroId ? 'pointer' : 'default',
              }}
            >
              {entry.hero?.image_url ? (
                <img src={entry.hero.image_url} alt={entry.hero?.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                  }}
                >
                  #{index + 1}
                </div>
              )}
            </button>
            <div style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                <span data-numeric style={{ marginRight: 4 }}>#{index + 1}</span>
                {entry.hero?.name || '이름 없음'}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                Elo <span data-numeric>{Math.round(entry.rating ?? entry.score ?? 0)}</span> ·{' '}
                <span data-numeric>{entry.battles ?? 0}</span>전
              </span>
            </div>
            {onInvite || onWhisper ? (
              <div style={{ display: 'flex', gap: 6 }}>
                {onInvite ? (
                  <button
                    type="button"
                    onClick={() => onInvite({ heroId: entry.heroId, heroName: entry.hero?.name, gameId: entry.game_id })}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(148, 163, 184, 0.45)',
                      background: 'rgba(15, 23, 42, 0.3)',
                      color: '#e2e8f0',
                      fontSize: 11,
                    }}
                  >
                    초대
                  </button>
                ) : null}
                {onWhisper ? (
                  <button
                    type="button"
                    onClick={() => onWhisper({ heroId: entry.heroId, heroName: entry.hero?.name, gameId: entry.game_id })}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 999,
                      border: 'none',
                      background: 'rgba(56, 189, 248, 0.25)',
                      color: '#bae6fd',
                      fontSize: 11,
                    }}
                  >
                    귓속말
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </li>
  )
}

//
