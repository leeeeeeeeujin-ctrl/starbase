import React from 'react'

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
  section: {
    border: '1px solid #e2e8f0',
    borderRadius: 18,
    padding: 16,
    display: 'grid',
    gap: 14,
    background: '#f8fafc',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#0f172a',
  },
  emptyState: {
    padding: 12,
    textAlign: 'center',
    color: '#64748b',
    background: '#fff',
    borderRadius: 12,
    border: '1px dashed #cbd5f5',
  },
  participationGrid: {
    display: 'grid',
    gap: 12,
  },
  participationItem: {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    padding: 14,
    display: 'grid',
    gap: 6,
  },
  participationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  participationName: {
    fontWeight: 700,
    color: '#0f172a',
  },
  leaveButton: {
    padding: '6px 12px',
    borderRadius: 12,
    border: '1px solid #ef4444',
    background: '#fef2f2',
    color: '#b91c1c',
    fontWeight: 600,
    cursor: 'pointer',
  },
  statRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    color: '#475569',
    fontSize: 13,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 10px',
    borderRadius: 999,
    background: '#e0f2fe',
    color: '#0369a1',
    fontSize: 12,
    fontWeight: 600,
  },
  seasonList: {
    display: 'grid',
    gap: 10,
  },
  seasonItem: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    padding: 14,
    display: 'grid',
    gap: 6,
  },
  seasonMeta: {
    fontSize: 13,
    color: '#475569',
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  leaderboardList: {
    display: 'grid',
    gap: 4,
    paddingLeft: 16,
    color: '#475569',
    fontSize: 13,
  },
  logList: {
    display: 'grid',
    gap: 12,
  },
  logItem: {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    padding: 14,
    display: 'grid',
    gap: 6,
  },
  logMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    fontSize: 12,
    color: '#64748b',
    flexWrap: 'wrap',
  },
  textarea: {
    margin: 0,
    fontSize: 13,
    color: '#0f172a',
    lineHeight: 1.5,
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
  participations,
  seasons,
  logs,
  onLeaveGame,
  onRefresh,
}) {
  const handleLeave = async (participation) => {
    if (typeof onLeaveGame !== 'function') return
    if (!participation?.id) return
    const confirmed = window.confirm(
      `${participation.gameName} 참여 기록을 초기화할까요? 점수와 역할 정보가 삭제됩니다.`,
    )
    if (!confirmed) return
    const result = await onLeaveGame(participation.id)
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
          <section style={styles.section}>
            <span style={styles.sectionTitle}>참여 중인 게임</span>
            {participations.length === 0 ? (
              <div style={styles.emptyState}>참여 중인 랭킹 게임이 없습니다.</div>
            ) : (
              <div style={styles.participationGrid}>
                {participations.map((item) => (
                  <div key={item.id} style={styles.participationItem}>
                    <div style={styles.participationHeader}>
                      <span style={styles.participationName}>{item.gameName}</span>
                      {typeof onLeaveGame === 'function' ? (
                        <button type="button" style={styles.leaveButton} onClick={() => handleLeave(item)}>
                          참여 해제
                        </button>
                      ) : null}
                    </div>
                    <div style={styles.statRow}>
                      <span>레이팅 {formatNumber(item.rating)}</span>
                      <span>전투 {formatNumber(item.battles)}</span>
                      <span>승률 {formatWinRate(item.winRate)}</span>
                      {item.role ? <span>역할 {item.role}</span> : null}
                    </div>
                    <div style={styles.statRow}>
                      <span>참여일 {formatDate(item.joinedAt)}</span>
                      {item.status ? <span>상태 {item.status}</span> : null}
                    </div>
                    {item.heroIds?.length ? (
                      <div style={styles.statRow}>
                        {item.heroIds.map((id) => (
                          <span key={id} style={styles.chip}>
                            #{id.slice(0, 6)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={styles.section}>
            <span style={styles.sectionTitle}>시즌 기록</span>
            {seasons.length === 0 ? (
              <div style={styles.emptyState}>저장된 시즌 기록이 없습니다.</div>
            ) : (
              <div style={styles.seasonList}>
                {seasons.map((season) => (
                  <div key={season.id} style={styles.seasonItem}>
                    <strong>{season.gameName}</strong>
                    <div style={styles.seasonMeta}>
                      <span>{season.name}</span>
                      <span>상태 {season.status || '알 수 없음'}</span>
                      <span>시작 {formatDate(season.startedAt)}</span>
                      {season.endedAt ? <span>종료 {formatDate(season.endedAt)}</span> : null}
                    </div>
                    {Array.isArray(season.leaderboard) && season.leaderboard.length ? (
                      <div style={styles.leaderboardList}>
                        {season.leaderboard.map((entry) => (
                          <div key={`${season.id}-${entry.rank}-${entry.hero_id}`}>
                            {entry.rank}. {entry.hero_name || entry.hero_id} — 레이팅 {formatNumber(entry.rating)} / 전투{' '}
                            {formatNumber(entry.battles)} / 승률 {formatWinRate(entry.win_rate)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={styles.section}>
            <span style={styles.sectionTitle}>최근 베틀로그</span>
            {logs.length === 0 ? (
              <div style={styles.emptyState}>아직 베틀로그가 없습니다.</div>
            ) : (
              <div style={styles.logList}>
                {logs.slice(0, 15).map((log) => (
                  <div key={log.id} style={styles.logItem}>
                    <div style={styles.logMeta}>
                      <span>{log.gameName}</span>
                      <span>{formatDate(log.createdAt)}</span>
                      <span>턴 {log.turnNo}</span>
                    </div>
                    {log.prompt ? <p style={styles.textarea}>프롬프트: {log.prompt}</p> : null}
                    {log.aiResponse ? <p style={styles.textarea}>응답: {log.aiResponse}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
