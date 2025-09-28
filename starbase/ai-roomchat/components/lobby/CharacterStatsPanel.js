import React, { useEffect, useMemo, useState } from 'react'

const styles = {
  root: {
    background: '#ffffff',
    borderRadius: 24,
    boxShadow: '0 28px 60px -46px rgba(15, 23, 42, 0.55)',
    padding: 20,
    display: 'grid',
    gap: 20,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#0f172a',
  },
  refreshButton: {
    padding: '8px 14px',
    borderRadius: 14,
    border: '1px solid #2563eb',
    background: '#eff6ff',
    color: '#1d4ed8',
    fontWeight: 600,
    cursor: 'pointer',
  },
  errorBox: {
    background: '#fef2f2',
    borderRadius: 16,
    border: '1px solid #fecaca',
    padding: 16,
    color: '#b91c1c',
    display: 'grid',
    gap: 12,
    textAlign: 'center',
  },
  retryButton: {
    padding: '8px 16px',
    borderRadius: 14,
    border: '1px solid #b91c1c',
    background: '#fee2e2',
    color: '#991b1b',
    fontWeight: 600,
    cursor: 'pointer',
  },
  emptyState: {
    padding: 16,
    textAlign: 'center',
    color: '#64748b',
    background: '#f8fafc',
    borderRadius: 14,
    border: '1px dashed #cbd5f5',
  },
  summarySection: {
    border: '1px solid #e2e8f0',
    borderRadius: 18,
    padding: 18,
    display: 'grid',
    gap: 14,
    background: '#f8fafc',
  },
  summaryGrid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  },
  metricCard: {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    padding: 14,
    display: 'grid',
    gap: 6,
  },
  metricLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 700,
    color: '#0f172a',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 12px',
    borderRadius: 999,
    background: '#e0f2fe',
    color: '#0369a1',
    fontWeight: 600,
    fontSize: 12,
  },
  contentGrid: {
    display: 'grid',
    gap: 18,
    gridTemplateColumns: 'minmax(0, 220px) minmax(0, 1fr)',
  },
  gameList: {
    display: 'grid',
    gap: 10,
  },
  gameButton: (active) => ({
    padding: 14,
    borderRadius: 16,
    border: active ? '2px solid #2563eb' : '1px solid #e2e8f0',
    background: active ? '#eff6ff' : '#fff',
    textAlign: 'left',
    cursor: 'pointer',
    display: 'grid',
    gap: 6,
  }),
  gameTitle: {
    fontWeight: 700,
    color: '#0f172a',
  },
  gameMeta: {
    fontSize: 13,
    color: '#475569',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  leaveButton: {
    marginTop: 6,
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid #ef4444',
    background: '#fef2f2',
    color: '#b91c1c',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 12,
  },
  detailsColumn: {
    display: 'grid',
    gap: 18,
  },
  detailSection: {
    border: '1px solid #e2e8f0',
    borderRadius: 18,
    padding: 18,
    background: '#f8fafc',
    display: 'grid',
    gap: 14,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: '#0f172a',
  },
  seasonCard: {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    padding: 16,
    display: 'grid',
    gap: 8,
  },
  seasonMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    fontSize: 13,
    color: '#475569',
  },
  battleCard: {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    padding: 14,
    display: 'grid',
    gap: 6,
  },
  battleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    fontSize: 13,
    color: '#475569',
  },
  battleOutcome: (outcome) => ({
    fontWeight: 700,
    color:
      outcome === '승리' ? '#15803d' : outcome === '패배' ? '#b91c1c' : '#0f172a',
  }),
}

function formatNumber(value) {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('ko-KR').format(value)
}

function formatWinRate(value) {
  if (value === null || value === undefined) return '-'
  const ratio = value > 1 ? value : value * 100
  return `${Math.round(ratio * 10) / 10}%`
}

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('ko-KR')
  } catch (error) {
    return value
  }
}

export default function CharacterStatsPanel({
  loading,
  error,
  summary,
  games,
  seasons,
  battles,
  onLeaveGame,
  onRefresh,
}) {
  const [selectedGameId, setSelectedGameId] = useState(null)

  useEffect(() => {
    if (!games?.length) {
      setSelectedGameId(null)
      return
    }
    if (selectedGameId && games.some((item) => item.gameId === selectedGameId)) {
      return
    }
    setSelectedGameId(games[0].gameId)
  }, [games, selectedGameId])

  const selectedGame = useMemo(
    () => games.find((item) => item.gameId === selectedGameId) || null,
    [games, selectedGameId],
  )

  const selectedSeasons = useMemo(() => {
    if (!selectedGameId) return []
    return seasons[selectedGameId] || []
  }, [seasons, selectedGameId])

  const selectedBattles = useMemo(() => {
    if (!selectedGameId) return []
    return (battles[selectedGameId] || []).slice(0, 40)
  }, [battles, selectedGameId])

  const favouriteTags = summary?.favouriteTags || []

  const handleLeave = async (game) => {
    if (!game?.id || typeof onLeaveGame !== 'function') return
    const confirmed = window.confirm(
      `${game.gameName} 참여 기록을 초기화할까요? 점수와 역할 정보가 삭제됩니다.`,
    )
    if (!confirmed) return
    const result = await onLeaveGame(game.id)
    if (result?.error) {
      alert(result.error)
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.headerRow}>
        <span style={styles.title}>캐릭터 통계</span>
        {typeof onRefresh === 'function' ? (
          <button type="button" style={styles.refreshButton} onClick={() => onRefresh()}>
            새로고침
          </button>
        ) : null}
      </div>

      {error ? (
        <div style={styles.errorBox}>
          <span>{error}</span>
          {typeof onRefresh === 'function' ? (
            <button type="button" style={styles.retryButton} onClick={() => onRefresh()}>
              다시 불러오기
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? <div style={styles.emptyState}>통계를 불러오는 중입니다…</div> : null}

      {!loading && !error ? (
        <>
          <section style={styles.summarySection}>
            <span style={styles.title}>전체 성과</span>
            <div style={styles.summaryGrid}>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>등록된 게임</span>
                <span style={styles.metricValue}>{formatNumber(games.length)}</span>
              </div>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>전체 승률</span>
                <span style={styles.metricValue}>{formatWinRate(summary?.overallWinRate)}</span>
              </div>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>평균 점수</span>
                <span style={styles.metricValue}>
                  {summary?.averageRating !== null && summary?.averageRating !== undefined
                    ? formatNumber(Math.round(summary.averageRating))
                    : '-'}
                </span>
              </div>
            </div>
            <div>
              <span style={styles.metricLabel}>선호 태그</span>
              {favouriteTags.length ? (
                <div style={styles.tagRow}>
                  {favouriteTags.map((item) => (
                    <span key={item.tag} style={styles.tagChip}>
                      {item.tag} · {item.count}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ ...styles.emptyState, border: '1px dashed #e2e8f0' }}>
                  선호 태그 데이터가 아직 없습니다.
                </div>
              )}
            </div>
          </section>

          <div style={styles.contentGrid}>
            <div style={styles.gameList}>
              {games.length === 0 ? (
                <div style={styles.emptyState}>참여 중인 랭킹 게임이 없습니다.</div>
              ) : (
                games.map((game) => {
                  const active = game.gameId === selectedGameId
                  return (
                    <button
                      key={game.id}
                      type="button"
                      style={styles.gameButton(active)}
                      onClick={() => setSelectedGameId(game.gameId)}
                    >
                      <span style={styles.gameTitle}>{game.gameName}</span>
                      <div style={styles.gameMeta}>
                        <span>레이팅 {formatNumber(game.rating)}</span>
                        <span>전투 {formatNumber(game.battles)}</span>
                        <span>승률 {formatWinRate(game.winRate)}</span>
                        {game.role ? <span>역할 {game.role}</span> : null}
                      </div>
                      {typeof onLeaveGame === 'function' ? (
                        <button
                          type="button"
                          style={styles.leaveButton}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleLeave(game)
                          }}
                        >
                          참여 해제
                        </button>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>

            <div style={styles.detailsColumn}>
              <section style={styles.detailSection}>
                <h2 style={styles.sectionTitle}>시즌 기록</h2>
                {selectedGame ? (
                  <span style={styles.metricLabel}>{selectedGame.gameName}</span>
                ) : null}
                {selectedSeasons.length === 0 ? (
                  <div style={styles.emptyState}>저장된 시즌 기록이 없습니다.</div>
                ) : (
                  selectedSeasons.map((season) => (
                    <div key={season.id} style={styles.seasonCard}>
                      <strong>{season.name}</strong>
                      <div style={styles.seasonMeta}>
                        <span>상태 {season.status || '알 수 없음'}</span>
                        <span>점수 {formatNumber(season.rating)}</span>
                        <span>전투 {formatNumber(season.matches)}</span>
                        <span>승률 {formatWinRate(season.winRate)}</span>
                        {season.rank ? <span>순위 {formatNumber(season.rank)}</span> : null}
                        {season.bestRank ? <span>최고 순위 {formatNumber(season.bestRank)}</span> : null}
                      </div>
                      <div style={styles.seasonMeta}>
                        <span>시작 {formatDate(season.startedAt)}</span>
                        {season.endedAt ? <span>종료 {formatDate(season.endedAt)}</span> : null}
                      </div>
                    </div>
                  ))
                )}
              </section>

              <section style={styles.detailSection}>
                <h2 style={styles.sectionTitle}>최근 베틀로그</h2>
                {selectedBattles.length === 0 ? (
                  <div style={styles.emptyState}>아직 전투 기록이 없습니다.</div>
                ) : (
                  selectedBattles.map((entry) => (
                    <div key={entry.id} style={styles.battleCard}>
                      <div style={styles.battleHeader}>
                        <span>{formatDate(entry.createdAt)}</span>
                        <span style={styles.battleOutcome(entry.outcome)}>{entry.outcome}</span>
                      </div>
                      <div style={styles.battleHeader}>
                        <span>상대 {entry.opponentName}</span>
                        <span>
                          점수 변화{' '}
                          {entry.scoreDelta === null || entry.scoreDelta === undefined
                            ? '-'
                            : entry.scoreDelta > 0
                            ? `+${formatNumber(entry.scoreDelta)}`
                            : formatNumber(entry.scoreDelta)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
