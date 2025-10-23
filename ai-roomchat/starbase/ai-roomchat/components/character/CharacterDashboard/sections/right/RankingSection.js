
const styles = {
  section: {
    borderRadius: 28,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.78)',
    padding: 24,
    display: 'grid',
    gap: 18,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { margin: 0, fontSize: 22 },
  subtitle: { fontSize: 13, color: '#94a3b8' },
  list: { display: 'grid', gap: 10 },
  row: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    padding: 14,
    background: 'rgba(30, 41, 59, 0.6)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
  },
  badge: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    background: 'rgba(8, 47, 73, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
  },
  info: { display: 'grid', gap: 4 },
  role: { fontSize: 12, color: '#94a3b8' },
  score: { textAlign: 'right', fontWeight: 700 },
  emptyState: {
    padding: 20,
    textAlign: 'center',
    color: '#94a3b8',
    borderRadius: 18,
    border: '1px dashed rgba(148, 163, 184, 0.35)',
  },
}

export default function RankingSection({ scoreboardRows, heroId, heroLookup, selectedEntry }) {
  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <h2 style={styles.title}>랭킹</h2>
        {selectedEntry ? (
          <span style={styles.subtitle}>{selectedEntry.game?.name || '—'}</span>
        ) : null}
      </div>
      {scoreboardRows.length ? (
        <div style={styles.list}>
          {scoreboardRows.map((row, index) => {
            const highlight = row.hero_id === heroId
            const displayName = heroLookup[row.hero_id]?.name || row.role || `참가자 ${index + 1}`
            return (
              <div
                key={row.id || `${row.hero_id}-${row.slot_no ?? index}`}
                style={{
                  ...styles.row,
                  background: highlight
                    ? 'rgba(56, 189, 248, 0.25)'
                    : styles.row.background,
                  border: highlight
                    ? '1px solid rgba(56, 189, 248, 0.55)'
                    : styles.row.border,
                }}
              >
                <div style={styles.badge}>#{index + 1}</div>
                <div style={styles.info}>
                  <strong>{displayName}</strong>
                  <span style={styles.role}>{row.role || '—'}</span>
                </div>
                <div style={styles.score}>{row.rating ?? row.score ?? '—'}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={styles.emptyState}>선택한 게임의 랭킹 데이터가 없습니다.</div>
      )}
    </section>
  )
}
