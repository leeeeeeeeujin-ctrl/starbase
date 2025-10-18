'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import useHeroBattles from '@/hooks/character/useHeroBattles'
import useHeroParticipations from '@/hooks/character/useHeroParticipations'

const styles = {
  page: {
    minHeight: '100dvh',
    width: '100%',
    boxSizing: 'border-box',
    background:
      'linear-gradient(180deg, rgba(15,23,42,0.86) 0%, rgba(8,47,73,0.92) 45%, rgba(2,6,23,0.96) 100%)',
    color: '#f8fafc',
  },
  stage: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '32px 18px 140px',
    display: 'grid',
    gap: 28,
  },
  heroHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    alignItems: 'flex-start',
  },
  heroProfile: {
    display: 'flex',
    gap: 16,
    alignItems: 'center',
  },
  heroPortrait: {
    width: 88,
    height: 88,
    borderRadius: 28,
    overflow: 'hidden',
    border: '1px solid rgba(148,163,184,0.5)',
    background: 'rgba(15,23,42,0.7)',
    flexShrink: 0,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  heroInitials: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
    fontWeight: 700,
    color: '#38bdf8',
    background: 'rgba(15,23,42,0.7)',
  },
  heroCopy: {
    display: 'grid',
    gap: 8,
  },
  heroName: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  heroMeta: {
    margin: 0,
    fontSize: 14,
    color: '#cbd5f5',
  },
  sliderShell: {
    display: 'grid',
    gap: 16,
  },
  sliderLabelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sliderLabel: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  sliderTrack: {
    display: 'flex',
    gap: 14,
    overflowX: 'auto',
    paddingBottom: 6,
    scrollbarWidth: 'thin',
  },
  sliderCard: {
    position: 'relative',
    width: 180,
    minHeight: 112,
    borderRadius: 22,
    border: '1px solid rgba(148,163,184,0.32)',
    background: 'rgba(15,23,42,0.65)',
    color: '#f8fafc',
    padding: 16,
    display: 'grid',
    gap: 8,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
  },
  sliderCardActive: {
    transform: 'translateY(-4px)',
    borderColor: 'rgba(56,189,248,0.65)',
    boxShadow: '0 18px 50px -32px rgba(56,189,248,0.85)',
  },
  sliderBackground: (imageUrl) => ({
    position: 'absolute',
    inset: 0,
    borderRadius: 22,
    backgroundImage: imageUrl
      ? `linear-gradient(180deg, rgba(2,6,23,0.28) 0%, rgba(2,6,23,0.9) 100%), url(${imageUrl})`
      : 'linear-gradient(180deg, rgba(2,6,23,0.28) 0%, rgba(2,6,23,0.9) 100%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: imageUrl ? 'saturate(1.2)' : 'none',
  }),
  sliderCardContent: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gap: 6,
  },
  sliderGameName: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.4,
  },
  sliderRole: {
    margin: 0,
    fontSize: 13,
    color: '#e0f2fe',
  },
  sliderMeta: {
    margin: 0,
    fontSize: 12,
    color: '#cbd5f5',
  },
  startButton: {
    width: '100%',
    borderRadius: 26,
    border: 'none',
    padding: '16px 24px',
    background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 100%)',
    color: '#020617',
    fontSize: 18,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 24px 80px -36px rgba(56,189,248,0.8)',
  },
  startDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  statsShell: {
    display: 'grid',
    gap: 16,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 16,
  },
  statCard: {
    borderRadius: 22,
    border: '1px solid rgba(59,130,246,0.28)',
    background: 'rgba(15,23,42,0.75)',
    padding: 18,
    display: 'grid',
    gap: 6,
  },
  statLabel: {
    margin: 0,
    fontSize: 13,
    color: '#cbd5f5',
  },
  statValue: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
  },
  statMeta: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
  },
  logShell: {
    borderRadius: 26,
    border: '1px solid rgba(59,130,246,0.32)',
    background: 'rgba(15,23,42,0.68)',
    padding: 20,
    display: 'grid',
    gap: 18,
  },
  logList: {
    display: 'grid',
    gap: 14,
  },
  logCard: {
    borderRadius: 20,
    border: '1px solid rgba(148,163,184,0.28)',
    background: 'rgba(2,6,23,0.78)',
    padding: 16,
    display: 'grid',
    gap: 10,
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
    fontSize: 15,
    fontWeight: 600,
  },
  logResult: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  logScore: {
    margin: 0,
    fontSize: 13,
    color: '#cbd5f5',
  },
  logListItem: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 1.6,
  },
  loadMoreButton: {
    justifySelf: 'center',
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.75)',
    color: '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  },
  emptyState: {
    padding: '24px 16px',
    borderRadius: 20,
    border: '1px dashed rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.55)',
    textAlign: 'center',
    color: '#cbd5f5',
    fontSize: 14,
  },
  errorText: {
    margin: 0,
    fontSize: 13,
    color: '#fda4af',
  },
}

const overlayStyles = {
  root: {
    position: 'fixed',
    top: 16,
    left: 16,
    width: 280,
    maxWidth: 'calc(100vw - 32px)',
    borderRadius: 22,
    border: '1px solid rgba(56,189,248,0.55)',
    background: 'linear-gradient(180deg, rgba(8,47,73,0.9) 0%, rgba(2,6,23,0.94) 100%)',
    color: '#e0f2fe',
    padding: 18,
    display: 'grid',
    gap: 12,
    zIndex: 1600,
    boxShadow: '0 28px 72px -40px rgba(56,189,248,0.8)',
  },
  header: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
  },
  subheader: {
    margin: 0,
    fontSize: 13,
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
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 16,
    border: 'none',
    background: '#38bdf8',
    color: '#020617',
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryButton: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.75)',
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

function MatchingOverlay({
  open,
  heroName,
  gameName,
  progress,
  phase,
  onCancel,
  onProceed,
}) {
  if (!open) return null

  const isReady = phase === 'ready'
  const headline = isReady ? '매칭이 준비됐어요' : '매칭 중입니다'
  const subline = isReady
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
        <button type="button" style={overlayStyles.secondaryButton} onClick={onCancel}>
          취소
        </button>
        <button
          type="button"
          style={{
            ...overlayStyles.primaryButton,
            opacity: isReady ? 1 : 0.45,
            cursor: isReady ? 'pointer' : 'not-allowed',
          }}
          onClick={isReady ? onProceed : undefined}
          disabled={!isReady}
        >
          {isReady ? '바로 시작' : '준비 중'}
        </button>
      </div>
    </aside>
  )
}

export default function CharacterPlayView({ hero }) {
  const router = useRouter()
  const sliderRef = useRef(null)

  const {
    loading: participationLoading,
    error: participationError,
    participations,
    selectedEntry,
    selectedGame,
    selectedGameId,
    selectedScoreboard,
    setSelectedGameId,
    refresh,
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

  const heroImage = hero?.image_url || null

  const currentRole = selectedEntry?.role || '슬롯 정보 없음'
  const currentMode = selectedEntry?.primaryMode || '모드 정보 없음'

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

  const handleSelectGame = useCallback(
    (gameId) => {
      setSelectedGameId(gameId)
    },
    [setSelectedGameId],
  )

  const handleStartMatch = useCallback(() => {
    if (!selectedGameId) {
      alert('먼저 게임을 선택하세요.')
      return
    }
    setMatchingState({ open: true, phase: 'search', progress: 0 })
  }, [selectedGameId])

  useEffect(() => {
    if (!matchingState.open) return
    if (matchingState.phase !== 'search') return

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

  const visibleBattleRows = useMemo(() => battleDetails.slice(0, visibleBattles || battleDetails.length), [
    battleDetails,
    visibleBattles,
  ])

  const [sliderRefreshKey, setSliderRefreshKey] = useState(0)

  const sliderHasScroll = useMemo(() => {
    const node = sliderRef.current
    if (!node) return false
    return node.scrollWidth > node.clientWidth + 4
  }, [participations.length, sliderRefreshKey])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined
    const node = sliderRef.current
    if (!node) return undefined
    const observer = new ResizeObserver(() => {
      setSliderRefreshKey((key) => key + 1)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const gameName = selectedGame?.name || selectedEntry?.game?.name || '선택된 게임 없음'

  return (
    <div style={styles.page}>
      <div style={styles.stage}>
        <MatchingOverlay
          open={matchingState.open}
          heroName={heroName}
          gameName={gameName}
          progress={matchingState.progress}
          phase={matchingState.phase}
          onCancel={handleCancelMatching}
          onProceed={handleProceedMatching}
        />

        <header style={styles.heroHeader}>
          <div style={styles.heroProfile}>
            <div style={styles.heroPortrait}>
              {heroImage ? (
                <img src={heroImage} alt="Hero portrait" style={styles.heroImage} />
              ) : (
                <div style={styles.heroInitials}>{heroName.slice(0, 2)}</div>
              )}
            </div>
            <div style={styles.heroCopy}>
              <h1 style={styles.heroName}>{heroName}</h1>
              <p style={styles.heroMeta}>
                {currentRole} · {currentMode}
              </p>
            </div>
          </div>
          {participationError ? <p style={styles.errorText}>{participationError}</p> : null}
        </header>

        <section style={styles.sliderShell}>
          <div style={styles.sliderLabelRow}>
            <h2 style={styles.sliderLabel}>참여 게임</h2>
            {sliderHasScroll ? <span style={styles.statMeta}>좌우로 스와이프해 선택하세요</span> : null}
          </div>
          {participationLoading ? (
            <div style={styles.emptyState}>참여 중인 게임을 불러오는 중입니다…</div>
          ) : participations.length ? (
            <div ref={sliderRef} style={styles.sliderTrack}>
              {participations.map((entry) => {
                const active = entry.game_id === selectedGameId
                const backgroundImage = entry.game?.cover_path || entry.game?.image_url || null
                return (
                  <button
                    key={entry.id || entry.game_id}
                    type="button"
                    onClick={() => handleSelectGame(entry.game_id)}
                    style={{
                      ...styles.sliderCard,
                      ...(active ? styles.sliderCardActive : {}),
                    }}
                  >
                    <div style={styles.sliderBackground(backgroundImage)} />
                    <div style={styles.sliderCardContent}>
                      <h3 style={styles.sliderGameName}>{entry.game?.name || '이름 없는 게임'}</h3>
                      <p style={styles.sliderRole}>{entry.role || '역할 미정'}</p>
                      <p style={styles.sliderMeta}>
                        {entry.sessionCount ? `${entry.sessionCount.toLocaleString('ko-KR')}회 참여` : '기록 없음'}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={styles.emptyState}>
              아직 이 캐릭터가 참여한 게임이 없습니다. 게임을 만들어 보거나 매칭에 참여해 보세요.
              <div style={{ marginTop: 12 }}>
                <button type="button" style={styles.loadMoreButton} onClick={refresh}>
                  새로고침
                </button>
              </div>
            </div>
          )}
        </section>

        <section>
          <button
            type="button"
            style={{
              ...styles.startButton,
              ...(selectedGameId ? {} : styles.startDisabled),
            }}
            onClick={selectedGameId ? handleStartMatch : undefined}
            disabled={!selectedGameId}
          >
            게임 시작
          </button>
        </section>

        <section style={styles.statsShell}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>선택한 게임 통계</h2>
            {selectedGame ? (
              <span style={styles.statMeta}>{selectedGame.name}</span>
            ) : null}
          </div>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <p style={styles.statLabel}>랭킹</p>
              <p style={styles.statValue}>{heroRank ? `#${heroRank}` : '—'}</p>
              <p style={styles.statMeta}>참가자 대비 현재 순위</p>
            </div>
            <div style={styles.statCard}>
              <p style={styles.statLabel}>스코어</p>
              <p style={styles.statValue}>{formatNumber(heroScore)}</p>
              <p style={styles.statMeta}>최근 기록된 전투 점수</p>
            </div>
            <div style={styles.statCard}>
              <p style={styles.statLabel}>승률</p>
              <p style={styles.statValue}>{formatWinRate(battleSummary)}</p>
              <p style={styles.statMeta}>최근 40판 기준</p>
            </div>
            <div style={styles.statCard}>
              <p style={styles.statLabel}>전투 수</p>
              <p style={styles.statValue}>{matchCount != null ? `${matchCount}` : '—'}</p>
              <p style={styles.statMeta}>집계된 총 전투 횟수</p>
            </div>
          </div>
        </section>

        <section style={styles.logShell}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>베틀 로그</h2>
            <span style={styles.statMeta}>
              {battleSummary?.total ? `${battleSummary.total}회 기록됨` : '최근 전투 기록'}
            </span>
          </div>

          {battleLoading ? (
            <div style={styles.emptyState}>전투 기록을 불러오는 중입니다…</div>
          ) : battleError ? (
            <div style={styles.emptyState}>
              <p style={styles.errorText}>{battleError}</p>
            </div>
          ) : visibleBattleRows.length ? (
            <div style={styles.logList}>
              {visibleBattleRows.map((battle) => (
                <article key={battle.id} style={styles.logCard}>
                  <div style={styles.logHeader}>
                    <p style={styles.logDate}>
                      {battle.created_at ? new Date(battle.created_at).toLocaleString('ko-KR') : '시간 정보 없음'}
                    </p>
                    <p style={styles.logResult}>{battle.result ? battle.result.toUpperCase() : 'PENDING'}</p>
                  </div>
                  <p style={styles.logScore}>
                    점수 변화: {battle.score_delta != null ? formatNumber(battle.score_delta) : '—'}
                  </p>
                  {battle.logs?.length ? (
                    <div>
                      {battle.logs.map((log) => (
                        <p key={`${battle.id}-${log.turn_no}`} style={styles.logListItem}>
                          {log.prompt ? `${log.turn_no ?? 0}턴 - ${log.prompt}` : '로그 없음'}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
              {visibleBattles && visibleBattles < battleDetails.length ? (
                <button type="button" style={styles.loadMoreButton} onClick={showMore}>
                  더 보기
                </button>
              ) : null}
            </div>
          ) : (
            <div style={styles.emptyState}>
              아직 기록된 베틀 로그가 없습니다. 게임을 시작해 기록을 쌓아 보세요.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

