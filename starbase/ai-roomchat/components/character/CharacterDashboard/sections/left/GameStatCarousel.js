import React from 'react'

const styles = {
  container: {
    borderRadius: 28,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(15, 23, 42, 0.75)',
    padding: 18,
    display: 'grid',
    gap: 16,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { margin: 0, fontSize: 18 },
  subtitle: { fontSize: 12, color: '#94a3b8' },
  scroll: {
    display: 'flex',
    gap: 16,
    overflowX: 'auto',
    paddingBottom: 6,
  },
  card: {
    minWidth: 240,
    borderRadius: 24,
    padding: 18,
    color: '#f8fafc',
    textAlign: 'left',
    display: 'grid',
    gap: 12,
    border: '1px solid rgba(148, 163, 184, 0.3)',
    background: 'rgba(15, 23, 42, 0.6)',
  },
  heading: { display: 'grid', gap: 4 },
  name: { fontSize: 16 },
  meta: { fontSize: 12, color: '#94a3b8' },
  statList: { display: 'grid', gap: 10 },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 14,
  },
  statLabel: { color: '#94a3b8' },
  statValue: { fontSize: 16 },
  emptyState: {
    padding: 20,
    textAlign: 'center',
    color: '#94a3b8',
    borderRadius: 18,
    border: '1px dashed rgba(148, 163, 184, 0.35)',
  },
}

export default function GameStatCarousel({
  hasParticipations,
  visibleStatSlides,
  selectedGameId,
  onSelectGame,
  selectedEntry,
}) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>게임별 지표</h2>
        {hasParticipations && selectedEntry ? (
          <span style={styles.subtitle}>{selectedEntry.game?.name || '—'}</span>
        ) : null}
      </div>
      {hasParticipations ? (
        <div style={styles.scroll}>
          {visibleStatSlides.map((slide) => {
            const active = slide.key === selectedGameId
            return (
              <button
                key={slide.key}
                type="button"
                onClick={() => onSelectGame(slide.key)}
                style={{
                  ...styles.card,
                  border: active
                    ? '1px solid rgba(56, 189, 248, 0.65)'
                    : styles.card.border,
                  background: active
                    ? 'linear-gradient(180deg, rgba(14, 165, 233, 0.35) 0%, rgba(15, 23, 42, 0.95) 100%)'
                    : styles.card.background,
                }}
              >
                <div style={styles.heading}>
                  <strong style={styles.name}>{slide.name}</strong>
                  <span style={styles.meta}>
                    {slide.role ? `${slide.role} 역할` : '참여 게임'}
                  </span>
                </div>
                <div style={styles.statList}>
                  {slide.stats.map((stat) => (
                    <div key={stat.key} style={styles.statRow}>
                      <span style={styles.statLabel}>{stat.label}</span>
                      <strong style={styles.statValue}>{stat.value}</strong>
                    </div>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div style={styles.emptyState}>아직 참가한 게임이 없습니다.</div>
      )}
    </div>
  )
}
