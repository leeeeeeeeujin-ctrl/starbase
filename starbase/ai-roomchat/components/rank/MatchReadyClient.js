'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'

import styles from './MatchReadyClient.module.css'
import { createEmptyMatchFlowState, readMatchFlowState } from '../../lib/rank/matchFlow'
import {
  setGameMatchParticipation,
  setGameMatchSlotTemplate,
  setGameMatchSnapshot,
  setGameMatchSessionMeta,
  subscribeGameMatchData,
} from '../../modules/rank/matchDataStore'
import {
  TURN_TIMER_OPTIONS,
  sanitizeSecondsOption,
  formatSecondsLabel,
  sanitizeTurnTimerVote,
  buildTurnTimerVotePatch,
} from '../../lib/rank/turnTimerMeta'
import { supabase } from '../../lib/supabase'
import { loadMatchFlowSnapshot } from '../../modules/rank/matchRealtimeSync'

const StartClient = dynamic(() => import('./StartClient'), {
  ssr: false,
  loading: () => (
    <div className={styles.overlayLoading}>
      <p className={styles.overlayLoadingText}>본게임 화면을 준비하고 있습니다…</p>
    </div>
  ),
})

function useMatchReadyState(gameId) {
  const [state, setState] = useState(() => createEmptyMatchFlowState())
  const refreshPromiseRef = useRef(null)
  const latestRef = useRef({
    slotTemplateVersion: null,
    slotTemplateUpdatedAt: null,
    sessionId: null,
    roomId: null,
  })
  const refreshTimeoutRef = useRef(null)

  const applySnapshot = useCallback(() => {
    if (!gameId && gameId !== 0) {
      const empty = createEmptyMatchFlowState()
      setState(empty)
      return empty
    }
    const snapshot = readMatchFlowState(gameId)
    setState(snapshot)
    return snapshot
  }, [gameId])

  const syncFromRemote = useCallback(async () => {
    if (!gameId && gameId !== 0) {
      latestRef.current = {
        slotTemplateVersion: null,
        slotTemplateUpdatedAt: null,
        sessionId: null,
        roomId: null,
      }
      const empty = createEmptyMatchFlowState()
      setState(empty)
      return empty
    }

    try {
      const payload = await loadMatchFlowSnapshot(supabase, gameId)
      if (payload) {
        if (Array.isArray(payload.roster) && payload.roster.length) {
          setGameMatchParticipation(gameId, {
            roster: payload.roster,
            participantPool: payload.participantPool,
            heroOptions: payload.heroOptions,
            heroMap: payload.heroMap,
            realtimeMode: payload.realtimeMode,
            hostOwnerId: payload.hostOwnerId,
            hostRoleLimit: payload.hostRoleLimit,
          })
        }

        if (payload.slotTemplate) {
          setGameMatchSlotTemplate(gameId, payload.slotTemplate)
        }

        if (payload.matchSnapshot) {
          setGameMatchSnapshot(gameId, payload.matchSnapshot)
        }

        if (payload.sessionMeta) {
          setGameMatchSessionMeta(gameId, payload.sessionMeta)
        }

        latestRef.current = {
          slotTemplateVersion:
            payload.slotTemplateVersion != null
              ? payload.slotTemplateVersion
              : latestRef.current.slotTemplateVersion,
          slotTemplateUpdatedAt:
            payload.slotTemplateUpdatedAt != null
              ? payload.slotTemplateUpdatedAt
              : latestRef.current.slotTemplateUpdatedAt,
          sessionId:
            payload.sessionId != null ? String(payload.sessionId).trim() : latestRef.current.sessionId,
          roomId: payload.roomId != null ? String(payload.roomId).trim() : latestRef.current.roomId,
        }
      }
    } catch (error) {
      console.warn('[MatchReadyClient] 실시간 매치 데이터를 불러오지 못했습니다:', error)
    }

    return applySnapshot()
  }, [gameId, applySnapshot])

  const refresh = useCallback(() => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current
    }
    const promise = syncFromRemote().finally(() => {
      refreshPromiseRef.current = null
    })
    refreshPromiseRef.current = promise
    return promise
  }, [syncFromRemote])

  useEffect(() => {
    latestRef.current = {
      slotTemplateVersion: null,
      slotTemplateUpdatedAt: null,
      sessionId: null,
      roomId: null,
    }
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!gameId && gameId !== 0) return undefined
    const unsubscribe = subscribeGameMatchData(gameId, () => {
      applySnapshot()
    })
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [gameId, applySnapshot])

  useEffect(() => {
    if (!gameId && gameId !== 0) return undefined

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) return
      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null
        refresh()
      }, 250)
    }

    const channel = supabase.channel(`match-ready-sync:${gameId}`, {
      config: { broadcast: { ack: true } },
    })

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rank_match_roster', filter: `game_id=eq.${gameId}` },
      scheduleRefresh,
    )

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rank_sessions', filter: `game_id=eq.${gameId}` },
      scheduleRefresh,
    )

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rank_rooms', filter: `game_id=eq.${gameId}` },
      scheduleRefresh,
    )

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'rank_session_meta' }, (payload) => {
      const sessionId = latestRef.current.sessionId
      if (!sessionId) return
      const record = payload?.new || payload?.record || null
      if (!record || typeof record !== 'object') return
      const incoming = record.session_id ?? record.sessionId ?? null
      if (!incoming) return
      if (String(incoming).trim() !== String(sessionId).trim()) return
      scheduleRefresh()
    })

    try {
      const subscription = channel.subscribe()
      if (subscription && typeof subscription.then === 'function') {
        subscription.catch((error) => {
          console.warn('[MatchReadyClient] 실시간 채널 구독 실패:', error)
        })
      }
    } catch (error) {
      console.warn('[MatchReadyClient] 실시간 채널 구독 실패:', error)
    }

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
        refreshTimeoutRef.current = null
      }
      try {
        channel.unsubscribe()
      } catch (error) {
        console.warn('[MatchReadyClient] 실시간 채널 해제 실패:', error)
      }
      supabase.removeChannel(channel)
    }
  }, [gameId, refresh])

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

  const asyncFill = state?.sessionMeta?.asyncFill
  if (asyncFill?.mode === 'off' && asyncFill?.seatLimit) {
    const allowed = Number(asyncFill.seatLimit.allowed) || 0
    const total = Number(asyncFill.seatLimit.total) || 0
    const queueCount = Array.isArray(asyncFill.fillQueue) ? asyncFill.fillQueue.length : 0
    const roleLabel = asyncFill.hostRole || '역할 미지정'
    if (total > 0) {
      lines.push(
        `비실시간 충원 · ${roleLabel} 좌석 ${allowed}/${total} · 대기열 ${queueCount}명`,
      )
    }
  }

  return lines
}

function buildRosterDisplay(roster, viewer, blindMode, asyncFill) {
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
  const seatIndexes = new Set(
    Array.isArray(asyncFill?.seatIndexes)
      ? asyncFill.seatIndexes.map((value) => Number(value)).filter(Number.isFinite)
      : [],
  )
  const overflowIndexes = new Set(
    Array.isArray(asyncFill?.overflow)
      ? asyncFill.overflow
          .map((entry) => Number(entry?.slotIndex))
          .filter((value) => Number.isFinite(value))
      : [],
  )
  const pendingIndexes = new Set(
    Array.isArray(asyncFill?.pendingSeatIndexes)
      ? asyncFill.pendingSeatIndexes
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      : [],
  )
  const hasSeatLimit = seatIndexes.size > 0

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
    const slotIndex = Number.isFinite(Number(entry.slotIndex))
      ? Number(entry.slotIndex)
      : index
    let readyLabel = isOccupied ? '착석 완료' : '대기'

    if (overflowIndexes.has(slotIndex)) {
      readyLabel = isOccupied ? '대기열 (자동 충원 대기)' : '대기열 슬롯'
    } else if (hasSeatLimit && !seatIndexes.has(slotIndex)) {
      readyLabel = isOccupied ? '예비 슬롯' : '예비 슬롯'
    } else if (!isOccupied && pendingIndexes.has(slotIndex)) {
      readyLabel = '자동 충원 예정'
    }

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
  const asyncFillInfo = useMemo(() => state?.sessionMeta?.asyncFill || null, [state?.sessionMeta?.asyncFill])
  const rosterDisplay = useMemo(
    () => buildRosterDisplay(state?.roster, state?.viewer, state?.room?.blindMode, asyncFillInfo),
    [state?.roster, state?.viewer, state?.room?.blindMode, asyncFillInfo],
  )
  const asyncFillSummary = useMemo(() => {
    if (!asyncFillInfo || asyncFillInfo.mode !== 'off') return null
    const seatLimit = asyncFillInfo.seatLimit || {}
    const allowed = Number(seatLimit.allowed) || 0
    const total = Number(seatLimit.total) || 0
    const pendingCount = Array.isArray(asyncFillInfo.pendingSeatIndexes)
      ? asyncFillInfo.pendingSeatIndexes.length
      : 0
    const queue = Array.isArray(asyncFillInfo.fillQueue) ? asyncFillInfo.fillQueue : []
    return {
      role: asyncFillInfo.hostRole || '역할 미지정',
      allowed,
      total,
      pendingCount,
      queue,
    }
  }, [asyncFillInfo])

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
          {asyncFillSummary ? (
            <div className={styles.asyncFillSummary}>
              <div className={styles.asyncFillTitle}>비실시간 자동 충원</div>
              <p className={styles.asyncFillText}>
                {`${asyncFillSummary.role} 좌석 ${asyncFillSummary.allowed}/${asyncFillSummary.total} · 대기 슬롯 ${asyncFillSummary.pendingCount}개`}
              </p>
              {asyncFillSummary.queue.length ? (
                <div className={styles.asyncFillQueue}>
                  <span className={styles.asyncFillQueueLabel}>대기 후보:</span>
                  <span className={styles.asyncFillQueueNames}>
                    {asyncFillSummary.queue
                      .map((candidate) => candidate.heroName || candidate.ownerId)
                      .join(', ')}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
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
            <div className={styles.overlayScrollArea}>
              <StartClient gameId={gameId} onRequestClose={() => setShowGame(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
