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
import SessionChatPanel from './SessionChatPanel'
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
    router.push('/rooms').catch(() => {})
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
  const isAsyncMode = asyncFillInfo?.mode === 'off'
  const blindMode = Boolean(matchState?.room?.blindMode)
  const rosterEntries = Array.isArray(matchState?.roster) ? matchState.roster : []
  const viewerOwnerId = useMemo(() => {
    const raw = matchState?.viewer?.ownerId || matchState?.viewer?.viewerId
    return raw ? String(raw).trim() : ''
  }, [matchState?.viewer?.ownerId, matchState?.viewer?.viewerId])
  const viewerSlotIndex = useMemo(() => {
    if (!viewerOwnerId) return null
    if (!Array.isArray(participants) || !participants.length) return null
    const index = participants.findIndex((participant) => {
      if (!participant) return false
      const ownerId =
        (participant.owner_id != null && String(participant.owner_id).trim()) ||
        (participant.ownerId != null && String(participant.ownerId).trim()) ||
        (participant.ownerID != null && String(participant.ownerID).trim()) ||
        (participant.owner?.id != null && String(participant.owner.id).trim()) ||
        ''
      return ownerId && ownerId === viewerOwnerId
    })
    return index >= 0 ? index : null
  }, [participants, viewerOwnerId])
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
  const restrictedContext = blindMode || isAsyncMode
  const viewerIsHostOwner = Boolean(hostOwnerId && viewerOwnerId && viewerOwnerId === hostOwnerId)
  const viewerMatchesHostRole = Boolean(
    normalizedHostRole && normalizedViewerRole && normalizedHostRole === normalizedViewerRole,
  )
  const viewerMaySeeFull = !restrictedContext || viewerIsHostOwner || viewerMatchesHostRole
  const viewerCanToggleDetails = restrictedContext && (viewerIsHostOwner || viewerMatchesHostRole)
  const [showRosterDetails, setShowRosterDetails] = useState(() => viewerMaySeeFull)

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

        <SessionChatPanel
          sessionId={sessionInfo?.id || null}
          sessionHistory={matchState?.sessionHistory || null}
          viewerSlotIndex={viewerSlotIndex}
          participants={participants}
        />
      </div>
    </div>
  )
}
