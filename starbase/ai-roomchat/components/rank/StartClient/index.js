'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import styles from './StartClient.module.css'
import HeaderControls from './HeaderControls'
import RosterPanel from './RosterPanel'
import TurnInfoPanel from './TurnInfoPanel'
import ManualResponsePanel from './ManualResponsePanel'
import StatusBanner from './StatusBanner'
import LogsPanel from './LogsPanel'
import { clearMatchFlow, readMatchFlowState } from '../../../lib/rank/matchFlow'
import { useStartClientEngine } from './useStartClientEngine'

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

export default function StartClient() {
  const router = useRouter()
  const [gameId, setGameId] = useState('')
  const [matchState, setMatchState] = useState(() => readMatchFlowState(''))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!router.isReady) return
    const { id } = router.query
    if (typeof id !== 'string' || !id.trim()) {
      setGameId('')
      setMatchState(readMatchFlowState(''))
      setReady(true)
      return
    }
    setGameId(id)
    setMatchState(readMatchFlowState(id))
    setReady(true)

    return () => {
      clearMatchFlow(id)
    }
  }, [router.isReady, router.query])

  const engine = useStartClientEngine(gameId)
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
    currentActor,
    canSubmitAction,
    sessionInfo,
    realtimePresence,
    realtimeEvents,
    dropInSnapshot,
    consensus,
  } = engine

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
    if (matchState?.room?.id) {
      router.push(`/rooms/${matchState.room.id}`).catch(() => {})
      return
    }
    if (gameId) {
      router.push(`/rank/${gameId}`).catch(() => {})
      return
    }
    router.push('/rooms').catch(() => {})
  }, [router, matchState?.room?.id, gameId])

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

  const realtimeLockNotice = useMemo(() => {
    if (!consensus?.active) return ''
    if (consensus.viewerEligible) {
      return `동의 ${consensus.count}/${consensus.required}명 확보 중입니다.`
    }
    return '다른 참가자의 동의를 기다리고 있습니다.'
  }, [consensus?.active, consensus?.viewerEligible, consensus?.count, consensus?.required])

  const manualDisabled = preflight || !canSubmitAction
  const manualDisabledReason = preflight
    ? '먼저 게임을 시작해 주세요.'
    : '현재 차례의 플레이어만 응답을 제출할 수 있습니다.'

  if (!ready) {
    return (
      <div className={styles.page}>
        <div className={styles.shell}>
          <p className={styles.status}>매칭 정보를 불러오는 중…</p>
        </div>
      </div>
    )
  }

  if (!gameId || !matchState?.snapshot) {
    return (
      <div className={styles.page}>
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
    <div className={styles.page}>
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
        />

        <LogsPanel
          logs={logs}
          aiMemory={aiMemory}
          playerHistories={playerHistories}
          realtimeEvents={realtimeEvents}
        />
      </div>
    </div>
  )
}
