'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'

import styles from './StartClient.module.css'
import HeaderControls from './HeaderControls'
import RosterPanel from './RosterPanel'
import TurnInfoPanel from './TurnInfoPanel'
import TurnSummaryPanel from './TurnSummaryPanel'
import ManualResponsePanel from './ManualResponsePanel'
import StatusBanner from './StatusBanner'
import SharedChatDock from '../../common/SharedChatDock'
import {
  clearMatchFlow,
  createEmptyMatchFlowState,
  readMatchFlowState,
} from '../../../lib/rank/matchFlow'
import { subscribeGameMatchData } from '../../../modules/rank/matchDataStore'
import { normalizeRoleName } from '../../../lib/rank/roleLayoutLoader'
import { useStartClientEngine } from './useStartClientEngine'
import { supabase } from '../../../lib/supabase'
import { buildSessionMetaRequest, postSessionMeta } from '../../../lib/rank/sessionMetaClient'

function toTrimmedId(value) {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}

function toSlotIndex(value, fallback) {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  return fallback
}

function buildParticipantRoster(participants) {
  if (!Array.isArray(participants)) return []
  return participants
    .map((participant, index) => {
      if (!participant) return null
      const hero = participant.hero || {}
      const heroId =
        toTrimmedId(participant.heroId ?? participant.hero_id ?? participant.heroID ?? hero.id) || null
      const ownerId =
        toTrimmedId(
          participant.ownerId ??
            participant.owner_id ??
            participant.ownerID ??
            participant.owner?.id ??
            participant.user_id ??
            participant.userId,
        ) || null
      const slotIndex = toSlotIndex(participant.slotIndex ?? participant.slot_index, index)
      const role = participant.role || participant.role_name || ''
      const heroName =
        hero.name ??
        participant.hero_name ??
        participant.heroName ??
        participant.displayName ??
        ''
      const avatarUrl =
        hero.avatar_url ??
        hero.image_url ??
        participant.hero_avatar_url ??
        participant.avatar_url ??
        participant.avatarUrl ??
        null
      return {
        slotIndex,
        role,
        heroId,
        ownerId,
        heroName,
        avatarUrl,
        ready: participant.ready === true,
      }
    })
    .filter(Boolean)
}

function buildMatchRoster(roster) {
  if (!Array.isArray(roster)) return []
  return roster
    .map((entry, index) => {
      if (!entry) return null
      const heroId = toTrimmedId(entry.heroId ?? entry.hero_id)
      const ownerId = toTrimmedId(entry.ownerId ?? entry.owner_id)
      const slotIndex = toSlotIndex(entry.slotIndex ?? entry.slot_index, index)
      return {
        slotIndex,
        role: entry.role || '',
        heroId,
        ownerId,
        heroName: entry.heroName || entry.hero_name || '',
        avatarUrl: entry.avatarUrl ?? entry.avatar_url ?? null,
        ready: entry.ready === true,
      }
    })
    .filter(Boolean)
}

function mergeRosterEntries(primary, fallback) {
  if (!primary.length) return fallback
  return primary.map((entry) => {
    const candidate = fallback.find((target) => {
      if (!target) return false
      if (entry.heroId && target.heroId && entry.heroId === target.heroId) return true
      if (entry.ownerId && target.ownerId && entry.ownerId === target.ownerId) return true
      return false
    })
    if (!candidate) {
      return entry
    }
    return {
      ...entry,
      role: entry.role || candidate.role || '',
      heroName: entry.heroName || candidate.heroName || '',
      avatarUrl: entry.avatarUrl || candidate.avatarUrl || null,
      ready: entry.ready || candidate.ready || false,
    }
  })
}

function findRosterEntry(roster, { heroId = null, ownerId = null } = {}) {
  if (!Array.isArray(roster) || roster.length === 0) return null
  return (
    roster.find((entry) => {
      if (!entry) return false
      if (heroId && entry.heroId && entry.heroId === heroId) return true
      if (ownerId && entry.ownerId && entry.ownerId === ownerId) return true
      return false
    }) || null
  )
}

const LogsPanel = dynamic(() => import('./LogsPanel'), {
  loading: () => <div className={styles.logsLoading}>로그 패널을 불러오는 중…</div>,
  ssr: false,
})

function buildSessionMeta(state) {
  if (!state) return []
  const meta = []
  if (state?.room?.code) {
    meta.push({ label: '방 코드', value: state.room.code })
  }
  if (state?.matchMode) {
    meta.push({ label: '매치 모드', value: state.matchMode })
  }
  if (state?.snapshot?.match?.matchType) {
    meta.push({ label: '매치 유형', value: state.snapshot.match.matchType })
  }
  if (Number.isFinite(Number(state?.snapshot?.match?.maxWindow)) && Number(state.snapshot.match.maxWindow) > 0) {
    meta.push({ label: '점수 범위', value: `±${Number(state.snapshot.match.maxWindow)}` })
  }
  if (state?.room?.realtimeMode) {
    meta.push({ label: '실시간 옵션', value: state.room.realtimeMode })
  }
  if (state?.rosterReadyCount != null && state?.totalSlots != null) {
    meta.push({ label: '참가자', value: `${state.rosterReadyCount}/${state.totalSlots}` })
  }
  return meta
}

function formatHeaderDescription({ state, meta, game }) {
  const lines = []
  if (game?.description) {
    const trimmed = String(game.description).trim()
    if (trimmed) {
      lines.push(trimmed)
    }
  }
  if (state?.room?.blindMode) {
    lines.push('블라인드 방에서 전투를 시작합니다. 이제 모든 참가자 정보가 공개됩니다.')
  }
  if (meta.length) {
    const summary = meta.map((item) => `${item.label}: ${item.value}`).join(' · ')
    lines.push(summary)
  }
  return lines.join(' · ')
}

function toDisplayError(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (typeof error.message === 'string') return error.message
  return '세션을 불러오는 중 오류가 발생했습니다.'
}

export default function StartClient({ gameId: gameIdProp, onRequestClose }) {
  const router = useRouter()
  const trimmedPropId = typeof gameIdProp === 'string' ? gameIdProp.trim() : ''
  const usePropGameId = Boolean(trimmedPropId)
  const [gameId, setGameId] = useState(trimmedPropId)
  const [matchState, setMatchState] = useState(() => createEmptyMatchFlowState())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (usePropGameId) {
      setGameId(trimmedPropId)
      setMatchState(readMatchFlowState(trimmedPropId))
      setReady(true)
      return
    }
    if (!router.isReady) return undefined
    const { id } = router.query
    const resolvedId = typeof id === 'string' ? id.trim() : ''
    if (!resolvedId) {
      setGameId('')
      setMatchState(createEmptyMatchFlowState())
      setReady(true)
      return undefined
    }
    setGameId(resolvedId)
    setMatchState(readMatchFlowState(resolvedId))
    setReady(true)

    return () => {
      clearMatchFlow(resolvedId)
    }
  }, [usePropGameId, trimmedPropId, router.isReady, router.query])

  useEffect(() => {
    if (!gameId) return undefined
    const unsubscribe = subscribeGameMatchData(gameId, () => {
      setMatchState(readMatchFlowState(gameId))
    })
    return unsubscribe
  }, [gameId])

  const hostOwnerId = useMemo(() => {
    const roomOwner = matchState?.room?.ownerId
    if (roomOwner !== null && roomOwner !== undefined) {
      const trimmed = String(roomOwner).trim()
      if (trimmed) {
        return trimmed
      }
    }
    const asyncHost = matchState?.sessionMeta?.asyncFill?.hostOwnerId
    if (asyncHost !== null && asyncHost !== undefined) {
      const trimmed = String(asyncHost).trim()
      if (trimmed) {
        return trimmed
      }
    }
    return ''
  }, [matchState?.room?.ownerId, matchState?.sessionMeta?.asyncFill?.hostOwnerId])

  const engine = useStartClientEngine(gameId, { hostOwnerId })
  const {
    loading: engineLoading,
    error: engineError,
    game,
    participants,
    currentNode,
    preflight,
    turn,
    activeGlobal,
    activeLocal,
    statusMessage,
    promptMetaWarning,
    apiKeyWarning,
    logs,
    aiMemory,
    playerHistories,
    apiKey,
    setApiKey,
    apiKeyCooldown,
    apiVersion,
    setApiVersion,
    geminiMode,
    setGeminiMode,
    geminiModel,
    setGeminiModel,
    geminiModelOptions,
    geminiModelLoading,
    geminiModelError,
    reloadGeminiModels,
    manualResponse,
    setManualResponse,
    isAdvancing,
    isStarting,
    handleStart,
    advanceWithAi,
    advanceWithManual,
    turnTimerSeconds,
    timeRemaining,
    turnDeadline,
    currentActor,
    canSubmitAction,
    sessionInfo,
    realtimePresence,
    realtimeEvents,
    dropInSnapshot,
    sessionOutcome,
    consensus,
    lastDropInTurn,
    turnTimerSnapshot,
    activeBackdropUrls,
    activeActorNames,
  } = engine

  const sessionMetaSignatureRef = useRef('')
  const turnStateSignatureRef = useRef('')
  const sessionIdRef = useRef(null)

  useEffect(() => {
    const nextSessionId = sessionInfo?.id || null
    if (sessionIdRef.current !== nextSessionId) {
      sessionIdRef.current = nextSessionId
      sessionMetaSignatureRef.current = ''
      turnStateSignatureRef.current = ''
    }
  }, [sessionInfo?.id])

  const sessionMeta = useMemo(() => buildSessionMeta(matchState), [matchState])
  const headerTitle = useMemo(() => {
    if (game?.name) return game.name
    if (matchState?.room?.mode) return `${matchState.room.mode} 메인 게임`
    return '메인 게임'
  }, [game?.name, matchState?.room?.mode])
  const headerDescription = useMemo(
    () => formatHeaderDescription({ state: matchState, meta: sessionMeta, game }),
    [matchState, sessionMeta, game],
  )

  const handleBackToRoom = useCallback(() => {
    if (typeof onRequestClose === 'function') {
      onRequestClose()
      return
    }
    if (matchState?.room?.id) {
      router.push(`/rooms/${matchState.room.id}`).catch(() => {})
      return
    }
    if (gameId) {
      router.push(`/rank/${gameId}`).catch(() => {})
      return
    }
    router.push('/match').catch(() => {})
  }, [router, matchState?.room?.id, gameId, onRequestClose])

  const statusMessages = useMemo(() => {
    const messages = []
    const errorText = toDisplayError(engineError)
    if (errorText) messages.push(errorText)
    if (statusMessage) messages.push(statusMessage)
    if (apiKeyWarning) messages.push(apiKeyWarning)
    if (promptMetaWarning) messages.push(promptMetaWarning)
    const unique = []
    messages.forEach((message) => {
      if (!message) return
      if (!unique.includes(message)) {
        unique.push(message)
      }
    })
    return unique
  }, [engineError, statusMessage, apiKeyWarning, promptMetaWarning])

  useEffect(() => {
    const sessionId = sessionInfo?.id
    if (!sessionId) return

    const stateForRequest = {
      sessionMeta: matchState?.sessionMeta || null,
      room: { realtimeMode: matchState?.room?.realtimeMode || null, id: matchState?.room?.id || null },
      roster: Array.isArray(matchState?.roster) ? matchState.roster : [],
      matchInstanceId: matchState?.matchInstanceId || '',
    }

    const {
      metaPayload,
      turnStateEvent,
      metaSignature,
      turnStateSignature,
      roomId: requestRoomId,
      matchInstanceId: requestMatchInstanceId,
      collaborators: requestCollaborators,
    } = buildSessionMetaRequest({
      state: stateForRequest,
    })

    if (!metaPayload) return

    const metaChanged = metaSignature && metaSignature !== sessionMetaSignatureRef.current
    const turnChanged = turnStateSignature && turnStateSignature !== turnStateSignatureRef.current

    if (!metaChanged && !turnChanged) {
      return
    }

    sessionMetaSignatureRef.current = metaSignature || ''
    if (turnChanged) {
      turnStateSignatureRef.current = turnStateSignature
    }

    let cancelled = false

    ;(async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          throw sessionError
        }
        const token = sessionData?.session?.access_token
        if (!token) {
          throw new Error('세션 토큰을 확인하지 못했습니다.')
        }

        await postSessionMeta({
          token,
          sessionId,
          gameId,
          roomId: requestRoomId,
          matchInstanceId: requestMatchInstanceId,
          collaborators: requestCollaborators,
          meta: metaPayload,
          turnStateEvent: turnChanged ? turnStateEvent : null,
          source: 'start-client',
        })
      } catch (error) {
        console.warn('[StartClient] 세션 메타 동기화 실패:', error)
        if (!cancelled) {
          if (metaChanged) {
            sessionMetaSignatureRef.current = ''
          }
          if (turnChanged) {
            turnStateSignatureRef.current = ''
          }
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [gameId, matchState?.room?.realtimeMode, matchState?.sessionMeta, sessionInfo?.id])

  const realtimeLockNotice = useMemo(() => {
    if (!consensus?.active) return ''
    if (consensus.viewerEligible) {
      return `동의 ${consensus.count}/${consensus.required}명 확보 중입니다.`
    }
    return '다른 참가자의 동의를 기다리고 있습니다.'
  }, [consensus?.active, consensus?.viewerEligible, consensus?.count, consensus?.required])

  const asyncFillInfo = matchState?.sessionMeta?.asyncFill || null
  const sessionExtras = matchState?.sessionMeta?.extras || null
  const isAsyncMode = asyncFillInfo?.mode === 'off'
  const blindMode = Boolean(matchState?.room?.blindMode)
  const rosterEntries = Array.isArray(matchState?.roster) ? matchState.roster : []
  const matchRosterForChat = useMemo(
    () => buildMatchRoster(matchState?.roster),
    [matchState?.roster],
  )
  const participantRosterForChat = useMemo(
    () => buildParticipantRoster(participants),
    [participants],
  )
  const chatRoster = useMemo(
    () => mergeRosterEntries(matchRosterForChat, participantRosterForChat),
    [matchRosterForChat, participantRosterForChat],
  )
  const viewerOwnerId = useMemo(() => {
    const raw = matchState?.viewer?.ownerId || matchState?.viewer?.viewerId
    return raw ? String(raw).trim() : ''
  }, [matchState?.viewer?.ownerId, matchState?.viewer?.viewerId])
  const viewerHeroId = useMemo(() => {
    const direct =
      toTrimmedId(
        matchState?.viewer?.heroId ??
          matchState?.viewer?.hero_id ??
          matchState?.viewer?.hero?.id,
      ) || null
    if (direct) return direct
    const ownerCandidate =
      toTrimmedId(matchState?.viewer?.ownerId ?? matchState?.viewer?.viewerId) ||
      (viewerOwnerId ? viewerOwnerId : null)
    if (ownerCandidate) {
      const entry = findRosterEntry(chatRoster, { ownerId: ownerCandidate })
      if (entry?.heroId) {
        return entry.heroId
      }
    }
    return null
  }, [
    chatRoster,
    matchState?.viewer?.hero?.id,
    matchState?.viewer?.heroId,
    matchState?.viewer?.hero_id,
    matchState?.viewer?.ownerId,
    matchState?.viewer?.viewerId,
    viewerOwnerId,
  ])
  const viewerHeroProfile = useMemo(() => {
    const ownerCandidate =
      toTrimmedId(matchState?.viewer?.ownerId ?? matchState?.viewer?.viewerId) ||
      (viewerOwnerId ? viewerOwnerId : null)
    const rosterEntry = findRosterEntry(chatRoster, {
      heroId: viewerHeroId,
      ownerId: ownerCandidate,
    })
    const heroName =
      matchState?.viewer?.heroName ??
      matchState?.viewer?.hero?.name ??
      rosterEntry?.heroName ??
      ''
    const avatarUrl =
      matchState?.viewer?.hero?.avatar_url ??
      matchState?.viewer?.avatarUrl ??
      matchState?.viewer?.avatar_url ??
      rosterEntry?.avatarUrl ??
      null

    if (!viewerHeroId && !ownerCandidate && !heroName && !avatarUrl) {
      return null
    }

    return {
      hero_id: viewerHeroId,
      owner_id: ownerCandidate,
      user_id: ownerCandidate || null,
      name: heroName || (viewerHeroId ? `캐릭터 #${viewerHeroId}` : '익명 참가자'),
      avatar_url: avatarUrl || null,
    }
  }, [
    chatRoster,
    matchState?.viewer?.avatarUrl,
    matchState?.viewer?.avatar_url,
    matchState?.viewer?.hero?.avatar_url,
    matchState?.viewer?.hero?.name,
    matchState?.viewer?.heroName,
    matchState?.viewer?.ownerId,
    matchState?.viewer?.viewerId,
    viewerHeroId,
    viewerOwnerId,
  ])
  const asyncMatchInstanceId = useMemo(() => {
    if (!asyncFillInfo) return null
    return (
      toTrimmedId(asyncFillInfo.matchInstanceId) ||
      toTrimmedId(asyncFillInfo.match_instance_id) ||
      null
    )
  }, [asyncFillInfo])
  const extrasMatchInstanceId = useMemo(() => {
    if (!sessionExtras) return null
    return (
      toTrimmedId(sessionExtras.matchInstanceId) ||
      toTrimmedId(sessionExtras.match_instance_id) ||
      null
    )
  }, [sessionExtras])
  const sessionInfoMatchInstanceId = useMemo(() => {
    if (!sessionInfo) return null
    return (
      toTrimmedId(sessionInfo.matchInstanceId) ||
      toTrimmedId(sessionInfo.match_instance_id) ||
      null
    )
  }, [sessionInfo])
  const chatMatchInstanceId = useMemo(() => {
    return (
      toTrimmedId(matchState?.matchInstanceId) ||
      asyncMatchInstanceId ||
      sessionInfoMatchInstanceId ||
      extrasMatchInstanceId ||
      null
    )
  }, [asyncMatchInstanceId, extrasMatchInstanceId, matchState?.matchInstanceId, sessionInfoMatchInstanceId])
  const chatSessionId = useMemo(() => {
    return (
      toTrimmedId(sessionInfo?.id) ||
      toTrimmedId(matchState?.sessionId) ||
      toTrimmedId(matchState?.sessionHistory?.sessionId) ||
      null
    )
  }, [matchState?.sessionHistory?.sessionId, matchState?.sessionId, sessionInfo?.id])
  const chatRoomId = useMemo(() => {
    return (
      toTrimmedId(matchState?.room?.id) ||
      toTrimmedId(sessionInfo?.roomId) ||
      toTrimmedId(sessionInfo?.room_id) ||
      null
    )
  }, [matchState?.room?.id, sessionInfo?.roomId, sessionInfo?.room_id])
  const chatGameId = useMemo(() => toTrimmedId(gameId), [gameId])
  const hostRoleName = useMemo(() => {
    if (typeof asyncFillInfo?.hostRole === 'string' && asyncFillInfo.hostRole.trim()) {
      return asyncFillInfo.hostRole.trim()
    }
    if (!hostOwnerId) return ''
    const hostEntry = rosterEntries.find((entry) => {
      if (!entry) return false
      const ownerId = entry.ownerId != null ? String(entry.ownerId).trim() : ''
      return ownerId === hostOwnerId
    })
    return hostEntry?.role ? String(hostEntry.role).trim() : ''
  }, [asyncFillInfo?.hostRole, hostOwnerId, rosterEntries])
  const normalizedHostRole = useMemo(() => normalizeRoleName(hostRoleName), [hostRoleName])
  const normalizedViewerRole = useMemo(
    () => normalizeRoleName(matchState?.viewer?.role || ''),
    [matchState?.viewer?.role],
  )
  const chatViewerRole = useMemo(
    () => matchState?.viewer?.role || normalizedViewerRole || null,
    [matchState?.viewer?.role, normalizedViewerRole],
  )
  const restrictedContext = blindMode || isAsyncMode
  const viewerIsHostOwner = Boolean(hostOwnerId && viewerOwnerId && viewerOwnerId === hostOwnerId)
  const viewerMatchesHostRole = Boolean(
    normalizedHostRole && normalizedViewerRole && normalizedHostRole === normalizedViewerRole,
  )
  const viewerMaySeeFull = !restrictedContext || viewerIsHostOwner || viewerMatchesHostRole
  const viewerCanToggleDetails = restrictedContext && (viewerIsHostOwner || viewerMatchesHostRole)
  const [showRosterDetails, setShowRosterDetails] = useState(() => viewerMaySeeFull)
  const allowMainChatInput = Boolean(canSubmitAction)

  useEffect(() => {
    setShowRosterDetails(viewerMaySeeFull)
  }, [viewerMaySeeFull, normalizedHostRole, normalizedViewerRole, restrictedContext])

  const manualDisabled = preflight || !canSubmitAction
  const manualDisabledReason = preflight
    ? '먼저 게임을 시작해 주세요.'
    : '현재 차례의 플레이어만 응답을 제출할 수 있습니다.'

  const pageStyle = useMemo(() => {
    const baseGradient =
      'radial-gradient(circle at top, rgba(16,26,51,0.92) 0%, rgba(4,7,18,0.96) 55%, rgba(2,4,10,1) 100%)'
    const heroLayers = Array.isArray(activeBackdropUrls)
      ? activeBackdropUrls
          .map((url) => (typeof url === 'string' ? url.trim() : ''))
          .filter(Boolean)
          .map((url) => `url(${url})`)
      : []
    return {
      backgroundImage: [baseGradient, ...heroLayers].join(', '),
      backgroundSize: ['cover', ...heroLayers.map(() => 'cover')].join(', '),
      backgroundPosition: ['center', ...heroLayers.map(() => 'center')].join(', '),
      backgroundRepeat: ['no-repeat', ...heroLayers.map(() => 'no-repeat')].join(', '),
    }
  }, [activeBackdropUrls])

  if (!ready) {
    return (
      <div className={styles.page} style={pageStyle}>
        <div className={styles.shell}>
          <p className={styles.status}>매칭 정보를 불러오는 중…</p>
        </div>
      </div>
    )
  }

  if (!gameId || !matchState?.snapshot) {
    return (
      <div className={styles.page} style={pageStyle}>
        <div className={styles.shell}>
          <p className={styles.status}>활성화된 매치 정보를 찾지 못했습니다.</p>
          <div className={styles.actionsRow}>
            <button type="button" className={styles.secondaryButton} onClick={handleBackToRoom}>
              방 목록으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page} style={pageStyle}>
      <div className={styles.shell}>
        <HeaderControls
          onBack={handleBackToRoom}
          title={headerTitle}
          description={headerDescription}
          preflight={preflight}
          onStart={handleStart}
          onAdvance={advanceWithAi}
          isAdvancing={isAdvancing}
          advanceDisabled={preflight || !sessionInfo?.id || engineLoading}
          consensus={consensus}
          startDisabled={engineLoading}
          isStarting={isStarting}
        />

        {statusMessages.length ? (
          <div className={styles.statusGroup}>
            {statusMessages.map((message, index) => (
              <StatusBanner key={`${message}-${index}`} message={message} />
            ))}
          </div>
        ) : null}

        <TurnSummaryPanel
          sessionMeta={matchState?.sessionMeta || null}
          turn={turn}
          turnTimerSeconds={turnTimerSeconds}
          timeRemaining={timeRemaining}
          turnDeadline={turnDeadline}
          turnTimerSnapshot={turnTimerSnapshot}
          lastDropInTurn={lastDropInTurn}
        />

        {restrictedContext ? (
          <section className={styles.visibilitySection}>
            <div className={styles.visibilityHeader}>
              <h2 className={styles.sectionTitle}>정보 가시성</h2>
              {Array.isArray(activeActorNames) && activeActorNames.length ? (
                <div className={styles.actorBadgeRow}>
                  {activeActorNames.map((name, index) => (
                    <span key={`${name}-${index}`} className={styles.actorBadge}>
                      {name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <p className={styles.visibilityHint}>
              블라인드 또는 비실시간 모드에서는 호스트 역할군만 상세한 캐릭터 정보를 확인할 수 있습니다.
            </p>
            <div className={styles.visibilityControls}>
              <button
                type="button"
                className={
                  !showRosterDetails || !viewerCanToggleDetails
                    ? styles.visibilityButtonActive
                    : styles.visibilityButton
                }
                onClick={() => setShowRosterDetails(false)}
              >
                요약 보기
              </button>
              <button
                type="button"
                className={showRosterDetails ? styles.visibilityButtonActive : styles.visibilityButton}
                onClick={() => {
                  if (!viewerMaySeeFull) return
                  setShowRosterDetails(true)
                }}
                disabled={!viewerCanToggleDetails}
              >
                상세 보기
              </button>
            </div>
            {!viewerMaySeeFull && (
              <p className={styles.visibilityNotice}>
                호스트와 동일한 역할군만 상세 정보를 열람할 수 있습니다.
              </p>
            )}
          </section>
        ) : null}

        {sessionMeta.length ? (
          <section className={styles.metaSection}>
            <h2 className={styles.sectionTitle}>매치 정보</h2>
            <ul className={styles.metaList}>
              {sessionMeta.map((item) => (
                <li key={item.label} className={styles.metaItem}>
                  <span className={styles.metaLabel}>{item.label}</span>
                  <span className={styles.metaValue}>{item.value}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className={styles.splitGrid}>
          <TurnInfoPanel
            turn={turn}
            currentNode={currentNode}
            activeGlobal={activeGlobal}
            activeLocal={activeLocal}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            apiVersion={apiVersion}
            onApiVersionChange={setApiVersion}
            geminiMode={geminiMode}
            onGeminiModeChange={setGeminiMode}
            geminiModel={geminiModel}
            onGeminiModelChange={setGeminiModel}
            geminiModelOptions={geminiModelOptions}
            geminiModelLoading={geminiModelLoading}
            geminiModelError={geminiModelError}
            onReloadGeminiModels={reloadGeminiModels}
            realtimeLockNotice={realtimeLockNotice}
            apiKeyNotice={apiKeyCooldown?.active ? apiKeyWarning : ''}
            currentActor={currentActor}
            timeRemaining={timeRemaining}
            turnTimerSeconds={turnTimerSeconds}
          />

          <ManualResponsePanel
            manualResponse={manualResponse}
            onChange={setManualResponse}
            onManualAdvance={advanceWithManual}
            onAiAdvance={advanceWithAi}
            isAdvancing={isAdvancing}
            disabled={manualDisabled}
            disabledReason={manualDisabled ? manualDisabledReason : ''}
            timeRemaining={timeRemaining}
            turnTimerSeconds={turnTimerSeconds}
          />
        </div>

        <RosterPanel
          participants={participants}
          realtimePresence={realtimePresence}
          dropInSnapshot={dropInSnapshot}
          sessionOutcome={sessionOutcome}
          showDetails={!restrictedContext || (showRosterDetails && viewerMaySeeFull)}
          viewerOwnerId={viewerOwnerId}
          normalizedHostRole={normalizedHostRole}
          normalizedViewerRole={normalizedViewerRole}
        />

        <LogsPanel
          logs={logs}
          aiMemory={aiMemory}
          playerHistories={playerHistories}
          realtimeEvents={realtimeEvents}
        />

        <section className={styles.chatSection}>
          <div className={styles.chatHeader}>
            <div>
              <h2 className={styles.sectionTitle}>공유 채널</h2>
              <p className={styles.chatSubtitle}>
                글로벌·메인·역할·귓속말 메시지를 한곳에서 확인하고 차례에 맞춰 발화하세요.
              </p>
            </div>
            <p className={styles.chatHint}>
              {allowMainChatInput
                ? '현재 차례입니다. 메인 채널 입력이 활성화되었습니다.'
                : '다른 참가자의 차례입니다. 메인 채널은 읽기 전용으로 전환되었습니다.'}
            </p>
          </div>
          <div className={styles.chatDock}>
            <SharedChatDock
              heroId={viewerHeroId}
              viewerHero={viewerHeroProfile}
              sessionId={chatSessionId}
              matchInstanceId={chatMatchInstanceId}
              gameId={chatGameId}
              roomId={chatRoomId}
              roster={chatRoster}
              viewerRole={chatViewerRole}
              allowMainInput={allowMainChatInput}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
