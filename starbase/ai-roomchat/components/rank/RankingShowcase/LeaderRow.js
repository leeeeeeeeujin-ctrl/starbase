export function LeaderRow({ entry, rank, onWhisper, onProfile }) {
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 14,
        alignItems: 'center',
        padding: '12px 16px',
        borderRadius: 18,
        background: rank === 1 ? 'rgba(56, 189, 248, 0.16)' : 'rgba(15, 23, 42, 0.55)',
        border: '1px solid rgba(148, 163, 184, 0.25)',
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
          width: 48,
          height: 48,
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'rgba(15, 23, 42, 0.45)',
          border: '1px solid rgba(148, 163, 184, 0.35)',
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
            }}
          >
            <span data-numeric>#{rank}</span>
          </div>
        )}
      </button>
      <div style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>
          <span data-numeric style={{ marginRight: 4 }}>#{rank}</span>
          {entry.hero?.name || '미정'}
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {entry.game?.name || '등록된 게임 없음'} ·{' '}
          <span data-numeric>{entry.battles ?? 0}</span>회 참여
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong data-numeric style={{ fontSize: 18 }}>{Math.round(entry.rating ?? entry.score ?? 0)}</strong>
        {onWhisper ? (
          <button
            type="button"
            onClick={() => onWhisper({ heroId: entry.heroId, heroName: entry.hero?.name, gameId: entry.game_id })}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid rgba(56, 189, 248, 0.45)',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#bae6fd',
              fontSize: 12,
            }}
          >
            귓속말
          </button>
        ) : null}
      </div>
    </li>
  )
}

//
