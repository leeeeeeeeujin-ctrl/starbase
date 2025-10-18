'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import useHeroBattles from '@/hooks/character/useHeroBattles'
import useHeroParticipations from '@/hooks/character/useHeroParticipations'

const panelStyles = {
  root: {
    display: 'grid',
    gap: 20,
  },
  section: {
    display: 'grid',
    gap: 12,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
  },
  subtitle: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
  },
  sliderTrack: {
    display: 'flex',
    gap: 12,
    overflowX: 'auto',
    padding: '6px 2px 6px 0',
    scrollbarWidth: 'thin',
  },
  sliderCard: {
    position: 'relative',
    width: 180,
    minHeight: 108,
    borderRadius: 18,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.7)',
    color: '#f8fafc',
    padding: 14,
    display: 'grid',
    gap: 6,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
  },
  sliderCardActive: {
    transform: 'translateY(-6px)',
    borderColor: 'rgba(56,189,248,0.7)',
    boxShadow: '0 20px 44px -24px rgba(56,189,248,0.7)',
  },
  sliderBackground: (imageUrl) => ({
    position: 'absolute',
    inset: 0,
    borderRadius: 18,
    backgroundImage: imageUrl
      ? `linear-gradient(180deg, rgba(2,6,23,0.2) 0%, rgba(2,6,23,0.85) 95%), url(${imageUrl})`
      : 'linear-gradient(180deg, rgba(2,6,23,0.4) 0%, rgba(2,6,23,0.85) 95%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: imageUrl ? 'saturate(1.15)' : 'none',
  }),
  sliderContent: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gap: 4,
  },
  sliderGameName: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.4,
  },
  sliderMeta: {
    margin: 0,
    fontSize: 12,
    color: '#cbd5f5',
  },
  buttonPrimary: {
    width: '100%',
    padding: '14px 18px',
    borderRadius: 20,
    border: 'none',
    background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 100%)',
    color: '#020617',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 26px 60px -36px rgba(56,189,248,0.75)',
  },
  buttonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 14,
  },
  statCard: {
    borderRadius: 18,
    border: '1px solid rgba(59,130,246,0.28)',
    background: 'rgba(15,23,42,0.68)',
    padding: 16,
    display: 'grid',
    gap: 6,
  },
  statLabel: {
    margin: 0,
    fontSize: 12,
    color: '#cbd5f5',
  },
  statValue: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
  },
  statMeta: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
  },
  logList: {
    display: 'grid',
    gap: 12,
  },
  logCard: {
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.28)',
    background: 'rgba(2,6,23,0.78)',
    padding: 14,
    display: 'grid',
    gap: 8,
  },
  logHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 10,
    flexWrap: 'wrap',
  },
  logDate: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
  },
  logResult: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  logMeta: {
    margin: 0,
    fontSize: 12,
    color: '#cbd5f5',
  },
  logText: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 1.6,
  },
  emptyState: {
    padding: '18px 14px',
    borderRadius: 16,
    border: '1px dashed rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.55)',
    textAlign: 'center',
    fontSize: 13,
    color: '#cbd5f5',
  },
  mutedButton: {
    justifySelf: 'center',
    padding: '8px 16px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.72)',
    color: '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  },
}

const overlayStyles = {
  root: {
    position: 'fixed',
    top: 16,
    left: 16,
    width: 280,
    maxWidth: 'calc(100vw - 32px)',
    borderRadius: 20,
    border: '1px solid rgba(56,189,248,0.55)',
    background: 'linear-gradient(180deg, rgba(8,47,73,0.92) 0%, rgba(2,6,23,0.94) 100%)',
    color: '#e0f2fe',
    padding: 16,
    display: 'grid',
    gap: 10,
    zIndex: 2200,
    boxShadow: '0 28px 72px -40px rgba(56,189,248,0.8)',
  },
  header: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
  },
  subheader: {
    margin: 0,
    fontSize: 12,
    color: '#bae6fd',
  },
  progressBar: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    background: 'rgba(148,163,184,0.35)',
    overflow: 'hidden',
  },
  progressFill: (value) => ({
    width: `${Math.min(100, Math.max(0, value))}%`,
    height: '100%',
    background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 100%)',
  }),
  actionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
  },
  primary: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 14,
    border: 'none',
    background: '#38bdf8',
    color: '#020617',
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondary: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.78)',
    color: '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  },
}

function formatNumber(value) {
  if (value == null) return '—'
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('ko-KR')
  }
  return String(value)
}

function formatWinRate(summary) {
  if (!summary || summary.rate == null) return '—'
  return `${summary.rate}%`
}

function MatchingOverlay({ open, heroName, gameName, progress, phase, onCancel, onProceed }) {
  if (!open) return null

  const ready = phase === 'ready'
  const headline = ready ? '매칭이 준비됐어요' : '매칭 중입니다'
  const subline = ready
    ? `${heroName}이(가) ${gameName} 전투를 시작할 준비가 됐어요.`
    : `${heroName}이(가) ${gameName} 참가자를 찾는 중이에요.`

  return (
    <aside style={overlayStyles.root}>
      <div>
        <p style={overlayStyles.header}>{headline}</p>
        <p style={overlayStyles.subheader}>{subline}</p>
      </div>
      <div style={overlayStyles.progressBar}>
        <div style={overlayStyles.progressFill(progress)} />
      </div>
      <div style={overlayStyles.actionRow}>
        <button type="button" style={overlayStyles.secondary} onClick={onCancel}>
          취소
        </button>
        <button
          type="button"
          style={{ ...overlayStyles.primary, opacity: ready ? 1 : 0.45, cursor: ready ? 'pointer' : 'not-allowed' }}
          onClick={ready ? onProceed : undefined}
          disabled={!ready}
        >
          {ready ? '바로 시작' : '준비 중'}
        </button>
      </div>
    </aside>
  )
}

export default function CharacterPlayPanel({ hero }) {
  const router = useRouter()

  const {
    loading: participationLoading,
    error: participationError,
    participations,
    selectedEntry,
    selectedGame,
    selectedGameId,
    selectedScoreboard,
    setSelectedGameId,
    refresh: refreshParticipations,
  } = useHeroParticipations({ hero })

  const {
    battleDetails,
    battleSummary,
    visibleBattles,
    loading: battleLoading,
    error: battleError,
    showMore,
  } = useHeroBattles({ hero, selectedGameId })

  const [matchingState, setMatchingState] = useState({ open: false, phase: 'search', progress: 0 })

  const heroName = useMemo(() => {
    const raw = hero?.name
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
    return '이름 없는 영웅'
  }, [hero?.name])

  const currentRole = selectedEntry?.role || '슬롯 정보 없음'

  const heroRank = useMemo(() => {
    if (!Array.isArray(selectedScoreboard) || !hero?.id) return null
    const index = selectedScoreboard.findIndex((row) => row?.hero_id === hero.id)
    return index >= 0 ? index + 1 : null
  }, [selectedScoreboard, hero?.id])

  const heroScore = useMemo(() => {
    if (selectedEntry?.score != null) return selectedEntry.score
    if (!Array.isArray(selectedScoreboard) || !hero?.id) return null
    const row = selectedScoreboard.find((item) => item?.hero_id === hero.id)
    return row?.score ?? row?.rating ?? null
  }, [selectedEntry?.score, selectedScoreboard, hero?.id])

  const matchCount = useMemo(() => {
    if (battleSummary?.total != null) return battleSummary.total
    if (selectedEntry?.sessionCount != null) return selectedEntry.sessionCount
    return null
  }, [battleSummary?.total, selectedEntry?.sessionCount])

  const handleStartMatch = useCallback(() => {
    if (!selectedGameId) {
      alert('먼저 게임을 선택하세요.')
      return
    }
    setMatchingState({ open: true, phase: 'search', progress: 0 })
  }, [selectedGameId])

  useEffect(() => {
    if (!matchingState.open || matchingState.phase !== 'search') return

    let cancelled = false
    const timer = setInterval(() => {
      setMatchingState((prev) => {
        if (!prev.open || prev.phase !== 'search' || cancelled) return prev
        const nextProgress = Math.min(100, prev.progress + 12)
        if (nextProgress >= 100) {
          return { open: true, phase: 'ready', progress: 100 }
        }
        return { ...prev, progress: nextProgress }
      })
    }, 280)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [matchingState.open, matchingState.phase])

  const handleCancelMatching = useCallback(() => {
    setMatchingState({ open: false, phase: 'search', progress: 0 })
  }, [])

  const handleProceedMatching = useCallback(() => {
    if (!hero?.id || !selectedGameId) {
      handleCancelMatching()
      return
    }
    const query = new URLSearchParams({ hero: hero.id, game: selectedGameId })
    router.push(`/match?${query.toString()}`)
    setMatchingState({ open: false, phase: 'search', progress: 0 })
  }, [handleCancelMatching, hero?.id, router, selectedGameId])

  const visibleBattleRows = useMemo(
    () => battleDetails.slice(0, visibleBattles || battleDetails.length),
    [battleDetails, visibleBattles],
  )

  const sliderSection = (
    <section style={panelStyles.section}>
      <div style={panelStyles.headerRow}>
        <h3 style={panelStyles.title}>참여한 게임</h3>
        <p style={panelStyles.subtitle}>{currentRole}</p>
      </div>
      {participationLoading ? (
        <div style={panelStyles.emptyState}>참여한 게임을 불러오는 중입니다…</div>
      ) : participationError ? (
        <div style={panelStyles.section}>
          <div style={panelStyles.emptyState}>{participationError}</div>
          <button type="button" style={panelStyles.mutedButton} onClick={refreshParticipations}>
            다시 시도
          </button>
        </div>
      ) : participations.length ? (
        <div style={panelStyles.sliderTrack}>
          {participations.map((entry) => {
            const active = entry.game_id === selectedGameId
            const backgroundImage = entry.game?.cover_url || entry.game?.image_url || null
            return (
              <button
                key={entry.game_id}
                type="button"
                onClick={() => setSelectedGameId(entry.game_id)}
                style={{
                  ...panelStyles.sliderCard,
                  ...(active ? panelStyles.sliderCardActive : {}),
                }}
              >
                <div style={panelStyles.sliderBackground(backgroundImage)} />
                <div style={panelStyles.sliderContent}>
                  <h4 style={panelStyles.sliderGameName}>{entry.game?.name || '이름 없는 게임'}</h4>
                  <p style={panelStyles.sliderMeta}>
                    {entry.sessionCount ? `${entry.sessionCount.toLocaleString('ko-KR')}회 참여` : '기록 없음'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div style={panelStyles.section}>
          <div style={panelStyles.emptyState}>아직 이 캐릭터가 참여한 게임이 없습니다.</div>
          <button type="button" style={panelStyles.mutedButton} onClick={refreshParticipations}>
            새로고침
          </button>
        </div>
      )}
    </section>
  )

  const startButton = (
    <section style={panelStyles.section}>
      <button
        type="button"
        style={{
          ...panelStyles.buttonPrimary,
          ...(selectedGameId ? {} : panelStyles.buttonDisabled),
        }}
        onClick={selectedGameId ? handleStartMatch : undefined}
        disabled={!selectedGameId}
      >
        게임 시작
      </button>
    </section>
  )

  const statsSection = (
    <section style={panelStyles.section}>
      <div style={panelStyles.headerRow}>
        <h3 style={panelStyles.title}>선택한 게임 통계</h3>
        {selectedGame ? <p style={panelStyles.subtitle}>{selectedGame.name}</p> : null}
      </div>
      <div style={panelStyles.statsGrid}>
        <div style={panelStyles.statCard}>
          <p style={panelStyles.statLabel}>랭킹</p>
          <p style={panelStyles.statValue}>{heroRank ? `#${heroRank}` : '—'}</p>
          <p style={panelStyles.statMeta}>참가자 대비 현재 순위</p>
        </div>
        <div style={panelStyles.statCard}>
          <p style={panelStyles.statLabel}>스코어</p>
          <p style={panelStyles.statValue}>{formatNumber(heroScore)}</p>
          <p style={panelStyles.statMeta}>최근 기록된 전투 점수</p>
        </div>
        <div style={panelStyles.statCard}>
          <p style={panelStyles.statLabel}>승률</p>
          <p style={panelStyles.statValue}>{formatWinRate(battleSummary)}</p>
          <p style={panelStyles.statMeta}>최근 40판 기준</p>
        </div>
        <div style={panelStyles.statCard}>
          <p style={panelStyles.statLabel}>전투 수</p>
          <p style={panelStyles.statValue}>{matchCount != null ? `${matchCount}` : '—'}</p>
          <p style={panelStyles.statMeta}>집계된 총 전투 횟수</p>
        </div>
      </div>
    </section>
  )

  const battleSection = (
    <section style={panelStyles.section}>
      <div style={panelStyles.headerRow}>
        <h3 style={panelStyles.title}>베틀 로그</h3>
        <p style={panelStyles.subtitle}>
          {battleSummary?.total ? `${battleSummary.total}회 기록됨` : '최근 전투 기록'}
        </p>
      </div>
      {battleLoading ? (
        <div style={panelStyles.emptyState}>전투 기록을 불러오는 중입니다…</div>
      ) : battleError ? (
        <div style={panelStyles.section}>
          <div style={panelStyles.emptyState}>{battleError}</div>
        </div>
      ) : visibleBattleRows.length ? (
        <div style={panelStyles.logList}>
          {visibleBattleRows.map((battle) => (
            <article key={battle.id} style={panelStyles.logCard}>
              <div style={panelStyles.logHeader}>
                <p style={panelStyles.logDate}>
                  {battle.created_at ? new Date(battle.created_at).toLocaleString('ko-KR') : '시간 정보 없음'}
                </p>
                <p style={panelStyles.logResult}>{battle.result ? battle.result.toUpperCase() : 'PENDING'}</p>
              </div>
              <p style={panelStyles.logMeta}>
                점수 변화: {battle.score_delta != null ? formatNumber(battle.score_delta) : '—'}
              </p>
              {battle.logs?.length ? (
                <div>
                  {battle.logs.map((log) => (
                    <p key={`${battle.id}-${log.turn_no}`} style={panelStyles.logText}>
                      {log.prompt ? `${log.turn_no ?? 0}턴 - ${log.prompt}` : '로그 없음'}
                    </p>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {visibleBattles && visibleBattles < battleDetails.length ? (
            <button type="button" style={panelStyles.mutedButton} onClick={showMore}>
              더 보기
            </button>
          ) : null}
        </div>
      ) : (
        <div style={panelStyles.emptyState}>아직 기록된 베틀 로그가 없습니다.</div>
      )}
    </section>
  )

  return (
    <div style={panelStyles.root}>
      {sliderSection}
      {startButton}
      {statsSection}
      {battleSection}
      <MatchingOverlay
        open={matchingState.open}
        heroName={heroName}
        gameName={selectedGame?.name || '선택한 게임'}
        progress={matchingState.progress}
        phase={matchingState.phase}
        onCancel={handleCancelMatching}
        onProceed={handleProceedMatching}
      />
    </div>
  )
}
