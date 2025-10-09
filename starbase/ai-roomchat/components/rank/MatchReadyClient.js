'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import styles from './MatchReadyClient.module.css'
import { createEmptyMatchFlowState, readMatchFlowState } from '../../lib/rank/matchFlow'
import StartClient from './StartClient'
import { setGameMatchSessionMeta } from '../../modules/rank/matchDataStore'

const TURN_TIMER_OPTIONS = [15, 30, 60, 120, 180]

function sanitizeSecondsOption(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null
  }
  return Math.floor(numeric)
}

function formatSecondsLabel(seconds) {
  const normalized = sanitizeSecondsOption(seconds)
  if (!normalized) return '미정'
  if (normalized < 60) {
    return `${normalized}초`
  }
  const minutes = Math.floor(normalized / 60)
  const remainder = normalized % 60
  if (remainder === 0) {
    return `${minutes}분`
  }
  return `${minutes}분 ${remainder}초`
}

function sanitizeTurnTimerVote(vote) {
  const base = {
    selections: {},
    voters: {},
    lastSelection: null,
    updatedAt: 0,
  }
  if (!vote || typeof vote !== 'object') {
    return base
  }

  const selections =
    vote.selections && typeof vote.selections === 'object' ? vote.selections : vote
  if (selections && typeof selections === 'object') {
    for (const [key, value] of Object.entries(selections)) {
      const option = sanitizeSecondsOption(key)
      const count = Number(value)
      if (option && Number.isFinite(count) && count > 0) {
        base.selections[String(option)] = Math.floor(count)
      }
    }
  }

  const voters = vote.voters && typeof vote.voters === 'object' ? vote.voters : null
  if (voters) {
    for (const [key, value] of Object.entries(voters)) {
      const voterId = String(key || '').trim()
      const choice = sanitizeSecondsOption(value)
      if (voterId) {
        base.voters[voterId] = choice
      }
    }
  }

  const lastSelection = sanitizeSecondsOption(vote.lastSelection)
  if (lastSelection) {
    base.lastSelection = lastSelection
  }

  const updatedAt = Number(vote.updatedAt)
  if (Number.isFinite(updatedAt) && updatedAt > 0) {
    base.updatedAt = updatedAt
  }

  return base
}

function buildTurnTimerVotePatch(previousVote, selection, voterId) {
  const normalized = sanitizeSecondsOption(selection)
  if (!normalized) {
    return previousVote && typeof previousVote === 'object' ? { ...previousVote } : {}
  }

  const existing = sanitizeTurnTimerVote(previousVote?.turnTimer || previousVote)
  const selections = { ...existing.selections }
  const voters = { ...existing.voters }

  if (voterId) {
    const previousSelection = sanitizeSecondsOption(voters[voterId])
    if (previousSelection) {
      const key = String(previousSelection)
      if (selections[key] && selections[key] > 0) {
        const decremented = selections[key] - 1
        if (decremented > 0) {
          selections[key] = decremented
        } else {
          delete selections[key]
        }
      }
    }
    voters[voterId] = normalized
  }

  const key = String(normalized)
  selections[key] = (Number(selections[key]) || 0) + 1

  const now = Date.now()
  const nextVote =
    previousVote && typeof previousVote === 'object' ? { ...previousVote } : {}

  nextVote.turnTimer = {
    selections,
    voters,
    lastSelection: normalized,
    updatedAt: now,
  }

  return nextVote
}

function useMatchReadyState(gameId) {
  const [state, setState] = useState(() => createEmptyMatchFlowState())

  const refresh = useCallback(() => {
    if (!gameId && gameId !== 0) {
      const empty = createEmptyMatchFlowState()
      setState(empty)
      return empty
    }
    const snapshot = readMatchFlowState(gameId)
    setState(snapshot)
    return snapshot
  }, [gameId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const allowStart = useMemo(
    () => Boolean(gameId && state?.snapshot && state?.hasActiveKey),
    [gameId, state?.snapshot, state?.hasActiveKey],
  )

  const missingKey = Boolean(state?.snapshot && !state?.hasActiveKey)

  return { state, refresh, allowStart, missingKey }
}

function getViewerIdentity(state) {
  const ownerId = state?.viewer?.ownerId ? String(state.viewer.ownerId).trim() : ''
  if (ownerId) return ownerId
  const viewerId = state?.viewer?.viewerId ? String(state.viewer.viewerId).trim() : ''
  if (viewerId) return viewerId
  const authId = state?.authSnapshot?.userId
  return authId ? String(authId).trim() : ''
}

function buildMetaLines(state) {
  const lines = []
  if (!state?.snapshot) return lines

  const code = state.snapshot?.match?.matchCode
  if (code) {
    lines.push(`방 코드 ${code}`)
  }

  const windowSize = state.snapshot?.match?.maxWindow
  if (Number.isFinite(Number(windowSize)) && Number(windowSize) > 0) {
    lines.push(`점수 범위 ±${Number(windowSize)}`)
  }

  const modeLabel = state.matchMode ? `모드 ${state.matchMode}` : ''
  if (modeLabel) {
    lines.push(modeLabel)
  }

  if (state.room?.realtimeMode === 'pulse') {
    lines.push('Pulse 실시간 규칙 적용')
    if (Number.isFinite(Number(state.room?.hostRoleLimit))) {
      lines.push(`호스트 역할군 제한 ${state.room.hostRoleLimit}명`)
    }
  } else if (state.room?.realtimeMode === 'standard') {
    lines.push('실시간 매치 준비 완료')
  }

  if (state.snapshot?.match?.matchType === 'drop_in') {
    lines.push('난입 매치 진행 중')
  }

  return lines
}

function buildRosterDisplay(roster, viewer, blindMode) {
  if (!Array.isArray(roster) || roster.length === 0) {
    return [
      {
        key: 'empty',
        label: '참가자 정보가 없습니다.',
        status: '',
      },
    ]
  }

  const viewerOwnerId = viewer?.ownerId ? String(viewer.ownerId).trim() : ''

  return roster.map((entry, index) => {
    const isOccupied = entry.heroId && entry.ownerId
    const hideIdentity =
      blindMode &&
      isOccupied &&
      (!viewerOwnerId || String(entry.ownerId).trim() !== viewerOwnerId)
    const heroLabel = hideIdentity
      ? '비공개 참가자'
      : entry.heroName || (entry.heroId ? `캐릭터 #${entry.heroId}` : '빈 슬롯')
    const roleLabel = entry.role || '역할 미지정'
    const readyLabel = isOccupied ? '착석 완료' : '대기'
    return {
      key: `${entry.slotId || index}-${entry.heroId || index}`,
      label: `${roleLabel} · ${heroLabel}`,
      status: readyLabel,
    }
  })
}

export default function MatchReadyClient({ gameId }) {
  const router = useRouter()
  const { state, refresh, allowStart, missingKey } = useMatchReadyState(gameId)
  const [showGame, setShowGame] = useState(false)
  const [voteNotice, setVoteNotice] = useState('')

  const metaLines = useMemo(() => buildMetaLines(state), [state])
  const rosterDisplay = useMemo(
    () => buildRosterDisplay(state?.roster, state?.viewer, state?.room?.blindMode),
    [state?.roster, state?.viewer, state?.room?.blindMode],
  )

  const viewerIdentity = useMemo(() => getViewerIdentity(state), [state])

  const appliedTurnTimerSeconds = useMemo(() => {
    const metaSeconds = Number(state?.sessionMeta?.turnTimer?.baseSeconds)
    if (Number.isFinite(metaSeconds) && metaSeconds > 0) {
      return Math.floor(metaSeconds)
    }
    return null
  }, [state?.sessionMeta?.turnTimer?.baseSeconds])

  const voteSnapshot = useMemo(
    () => sanitizeTurnTimerVote(state?.sessionMeta?.vote?.turnTimer),
    [state?.sessionMeta?.vote?.turnTimer],
  )

  const viewerSelection = useMemo(() => {
    if (!viewerIdentity) return null
    return sanitizeSecondsOption(voteSnapshot.voters?.[viewerIdentity])
  }, [viewerIdentity, voteSnapshot.voters])

  const handleRefresh = useCallback(() => {
    refresh()
  }, [refresh])

  const handleReturnToRoom = useCallback(() => {
    if (state?.room?.id) {
      router.push(`/rooms/${state.room.id}`).catch(() => {})
      return
    }
    router.push('/rooms').catch(() => {})
  }, [router, state?.room?.id])

  const handleStart = useCallback(() => {
    if (!gameId) return
    setShowGame(true)
  }, [gameId])

  useEffect(() => {
    if (showGame) {
      const previous = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = previous
      }
    }
    return undefined
  }, [showGame])

  useEffect(() => {
    if (!allowStart && showGame) {
      setShowGame(false)
    }
  }, [allowStart, showGame])

  useEffect(() => {
    if (!voteNotice) return undefined
    const timer = setTimeout(() => {
      setVoteNotice('')
    }, 2800)
    return () => clearTimeout(timer)
  }, [voteNotice])

  const handleVoteSelection = useCallback(
    (seconds) => {
      const normalized = sanitizeSecondsOption(seconds)
      if (!normalized || !gameId) return

      const now = Date.now()
      setGameMatchSessionMeta(gameId, {
        turnTimer: {
          baseSeconds: normalized,
          source: 'match-ready-vote',
          updatedAt: now,
        },
        vote: buildTurnTimerVotePatch(state?.sessionMeta?.vote, normalized, viewerIdentity),
        source: 'match-ready-client',
      })

      refresh()
      setVoteNotice(`${formatSecondsLabel(normalized)} 제한시간이 적용되었습니다.`)
    },
    [gameId, refresh, state?.sessionMeta?.vote, viewerIdentity],
  )

  const voteCounts = useMemo(() => {
    const entries = Object.entries(voteSnapshot.selections || {})
      .map(([key, value]) => {
        const option = sanitizeSecondsOption(key)
        const count = Number(value)
        if (!option || !Number.isFinite(count) || count <= 0) return null
        return { option, count: Math.floor(count) }
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count || a.option - b.option)
    return entries
  }, [voteSnapshot.selections])

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>{state?.room?.mode ? `${state.room.mode} 매치 준비` : '매치 준비'}</h1>
            <p className={styles.subtitle}>
              {state?.room?.code
                ? `코드 ${state.room.code} · 참가자 ${state.rosterReadyCount}/${state.totalSlots}`
                : '방 정보를 확인하고 있습니다.'}
            </p>
          </div>
          <div className={styles.actionsInline}>
            <button type="button" className={styles.secondaryButton} onClick={handleRefresh}>
              정보 새로고침
            </button>
            <button type="button" className={styles.secondaryButton} onClick={handleReturnToRoom}>
              방으로 돌아가기
            </button>
          </div>
        </header>

        {metaLines.length > 0 && (
          <section className={styles.meta}>
            {metaLines.map((line) => (
              <p key={line} className={styles.metaLine}>
                {line}
              </p>
            ))}
          </section>
        )}

        {state?.room?.blindMode ? (
          <section className={styles.bannerInfo}>
            <p className={styles.bannerTitle}>블라인드 모드가 활성화된 매치입니다.</p>
            <p className={styles.bannerBody}>
              전투가 시작되기 전까지는 다른 참가자의 캐릭터 정보가 공개되지 않습니다. 준비를 마친 뒤 메인
              게임으로 이동하면 전체 로스터가 표시됩니다.
            </p>
          </section>
        ) : null}

        {missingKey && (
          <section className={styles.bannerWarning}>
            <p className={styles.bannerTitle}>활성화된 AI API 키가 필요합니다.</p>
            <p className={styles.bannerBody}>
              방 찾기 헤더에서 API 키를 등록하고 사용 설정해야 전투를 시작할 수 있습니다.
            </p>
          </section>
        )}

        <section className={styles.voteSection}>
          <div className={styles.voteHeader}>
            <h2 className={styles.sectionTitle}>턴 제한시간 투표</h2>
            <p className={styles.voteDescription}>
              참가자들이 원하는 제한시간을 선택하면 메인 게임의 기본 타이머로 적용됩니다.
            </p>
          </div>
          <div className={styles.voteOptions}>
            {TURN_TIMER_OPTIONS.map((option) => {
              const seconds = sanitizeSecondsOption(option)
              if (!seconds) return null
              const isApplied = appliedTurnTimerSeconds === seconds
              const isMine = viewerSelection === seconds
              const summary = voteCounts.find((entry) => entry.option === seconds)
              return (
                <button
                  key={seconds}
                  type="button"
                  className={`${styles.voteOptionButton} ${
                    isApplied ? styles.voteOptionButtonActive : ''
                  }`}
                  onClick={() => handleVoteSelection(seconds)}
                >
                  <span className={styles.voteOptionLabel}>{formatSecondsLabel(seconds)}</span>
                  <span className={styles.voteOptionHint}>
                    {isApplied ? '적용 중' : isMine ? '내 선택' : '선택'}
                  </span>
                  {summary ? (
                    <span className={styles.voteOptionBadge}>{summary.count}표</span>
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className={styles.voteSummary}>
            <p className={styles.voteSummaryLine}>
              현재 적용된 제한시간: {formatSecondsLabel(appliedTurnTimerSeconds || 60)}
              {appliedTurnTimerSeconds ? '' : ' (기본값)'}
            </p>
            {voteCounts.length > 0 ? (
              <p className={styles.voteSummaryLine}>
                선호도 순위:{' '}
                {voteCounts
                  .map((entry) => `${formatSecondsLabel(entry.option)} ${entry.count}표`)
                  .join(' · ')}
              </p>
            ) : (
              <p className={styles.voteSummaryLine}>
                아직 저장된 투표가 없습니다. 원하는 제한시간을 선택해 주세요.
              </p>
            )}
            {voteNotice ? <p className={styles.voteNotice}>{voteNotice}</p> : null}
          </div>
        </section>

        <section className={styles.rosterSection}>
          <h2 className={styles.sectionTitle}>참가자 구성</h2>
          <ul className={styles.rosterList}>
            {rosterDisplay.map((entry) => (
              <li key={entry.key} className={styles.rosterItem}>
                <span className={styles.rosterLabel}>{entry.label}</span>
                <span className={styles.rosterStatus}>{entry.status}</span>
              </li>
            ))}
          </ul>
        </section>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleStart}
            disabled={!allowStart}
          >
            게임 화면 열기
          </button>
          {!allowStart && state?.snapshot && (
            <p className={styles.footerHint}>
              {!state.hasActiveKey
                ? 'AI API 키를 사용 설정한 뒤 다시 시도해 주세요.'
                : '참가자 정보를 준비하고 있습니다.'}
            </p>
          )}
        </footer>
      </div>
      {showGame ? (
        <div className={styles.overlayRoot}>
          <div className={styles.overlayBackdrop} />
          <div className={styles.overlayContent}>
            <StartClient gameId={gameId} onRequestClose={() => setShowGame(false)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
