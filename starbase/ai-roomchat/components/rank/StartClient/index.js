'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/router'

import HeaderControls from './HeaderControls'
import LogsPanel from './LogsPanel'
import ManualResponsePanel from './ManualResponsePanel'
import RosterPanel from './RosterPanel'
import StatusBanner from './StatusBanner'
import TurnInfoPanel from './TurnInfoPanel'
import { useStartClientEngine } from './useStartClientEngine'
import styles from './StartClient.module.css'

function buildBackgroundStyle(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { backgroundColor: '#0f172a' }
  }

  const safeUrls = urls.map((url) => `url(${url})`)
  if (safeUrls.length === 1) {
    return {
      backgroundImage: safeUrls[0],
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
  }

  const count = safeUrls.length
  const size = safeUrls.map(() => `${(100 / count).toFixed(2)}% 100%`).join(', ')
  const position = safeUrls
    .map((_, index) => {
      if (count === 1) return '50% 50%'
      const x = Math.round((index / (count - 1)) * 100)
      return `${x}% 50%`
    })
    .join(', ')

  return {
    backgroundImage: safeUrls.join(', '),
    backgroundSize: size,
    backgroundPosition: position,
    backgroundRepeat: 'no-repeat',
  }
}

export default function StartClient({ gameId: overrideGameId, onExit }) {
  const router = useRouter()
  const resolvedGameId = overrideGameId ?? router.query.id

  const {
    loading,
    error,
    game,
    participants,
    currentNode,
    preflight,
    turn,
    activeGlobal,
    activeLocal,
    statusMessage,
    logs,
    aiMemory,
    playerHistories,
    apiKey,
    setApiKey,
    apiVersion,
    setApiVersion,
    manualResponse,
    setManualResponse,
    isAdvancing,
    handleStart,
    advanceWithAi,
    advanceWithManual,
    turnTimerSeconds,
    timeRemaining,
    currentActor,
    canSubmitAction,
    activeBackdropUrls,
    activeBgmUrl,
  } = useStartClientEngine(resolvedGameId)

  const backgroundUrls = useMemo(() => {
    if (activeBackdropUrls && activeBackdropUrls.length) return activeBackdropUrls
    if (game?.image_url) return [game.image_url]
    return []
  }, [activeBackdropUrls, game?.image_url])

  const rootStyle = useMemo(() => buildBackgroundStyle(backgroundUrls), [backgroundUrls])
  const audioRef = useRef(null)

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (!activeBgmUrl) return

    const element = new Audio(activeBgmUrl)
    element.loop = true
    element.volume = 0.6
    element.play().catch(() => {})
    audioRef.current = element

    return () => {
      element.pause()
      audioRef.current = null
    }
  }, [activeBgmUrl])

  if (!resolvedGameId) {
    return <div style={{ padding: 16 }}>게임 정보가 없습니다.</div>
  }

  if (loading) {
    return <div style={{ padding: 16 }}>불러오는 중…</div>
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: '#b91c1c' }}>
        오류가 발생했습니다: {error}
      </div>
    )
  }

  const handleBack = () => {
    if (onExit) {
      onExit()
    } else {
      router.back()
    }
  }

  return (
    <div className={styles.root} style={rootStyle}>
      <div className={styles.content}>
        <HeaderControls
          onBack={handleBack}
          title={game?.name}
          description={game?.description}
          preflight={preflight}
          onStart={handleStart}
          onAdvance={advanceWithAi}
          isAdvancing={isAdvancing}
          canAdvance={canSubmitAction}
        />

        <StatusBanner message={statusMessage} />

        <div className={styles.mainGrid}>
          <RosterPanel participants={participants} />

          <div className={styles.secondaryGrid}>
            <TurnInfoPanel
              turn={turn}
              currentNode={currentNode}
              activeGlobal={activeGlobal}
              activeLocal={activeLocal}
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              apiVersion={apiVersion}
              onApiVersionChange={setApiVersion}
              realtimeLockNotice={
                game?.realtime_match
                  ? '실시간 매칭 중에는 세션을 시작한 뒤 API 버전을 변경할 수 없습니다.'
                  : ''
              }
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
              disabled={!canSubmitAction}
              disabledReason={
                canSubmitAction ? '' : '현재 차례의 플레이어만 응답을 제출할 수 있습니다.'
              }
              timeRemaining={timeRemaining}
              turnTimerSeconds={turnTimerSeconds}
            />

            <LogsPanel logs={logs} aiMemory={aiMemory} playerHistories={playerHistories} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Start client entry point that orchestrates the in-battle panels.
