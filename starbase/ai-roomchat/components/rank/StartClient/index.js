'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import HeaderControls from './HeaderControls'
import LogsPanel from './LogsPanel'
import ManualResponsePanel from './ManualResponsePanel'
import RosterPanel from './RosterPanel'
import StatusBanner from './StatusBanner'
import TurnInfoPanel from './TurnInfoPanel'
import { useStartClientEngine } from './useStartClientEngine'
import styles from './StartClient.module.css'
import { getHeroAudioManager } from '../../../lib/audio/heroAudioManager'

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
    activeBackdropUrls,
    activeBgmUrl,
    activeBgmDuration,
    activeAudioProfile,
    consensus,
  } = useStartClientEngine(resolvedGameId)

  const [timeoutNotice, setTimeoutNotice] = useState('')
  const autoStartedRef = useRef(false)
  const timeoutTrackerRef = useRef({ lastProcessed: null, misses: 0 })
  const autoAdvanceRemainingRef = useRef(0)
  const autoAdvanceRunningRef = useRef(false)

  const backgroundUrls = useMemo(() => {
    if (activeBackdropUrls && activeBackdropUrls.length) return activeBackdropUrls
    if (game?.image_url) return [game.image_url]
    return []
  }, [activeBackdropUrls, game?.image_url])

  const rootStyle = useMemo(() => buildBackgroundStyle(backgroundUrls), [backgroundUrls])
  const audioManager = useMemo(() => {
    if (typeof window === 'undefined') return null
    return getHeroAudioManager()
  }, [])
  const audioBaselineRef = useRef(null)

  const bannerMessage = useMemo(() => {
    const parts = [promptMetaWarning, apiKeyWarning, statusMessage]
      .map((part) => (part ? String(part) : ''))
      .filter((part) => part.trim().length)
    if (!parts.length) return ''
    const seen = new Set()
    const deduped = parts.filter((part) => {
      if (seen.has(part)) return false
      seen.add(part)
      return true
    })
    return deduped.join('\n')
  }, [promptMetaWarning, apiKeyWarning, statusMessage])

  const [historyOpen, setHistoryOpen] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)

  useEffect(() => {
    if (!audioManager) return undefined
    audioBaselineRef.current = audioManager.getState()

    return () => {
      const baseline = audioBaselineRef.current
      if (!baseline) {
        audioManager.setEqEnabled(false)
        audioManager.setReverbEnabled(false)
        audioManager.setCompressorEnabled(false)
        audioManager.setEnabled(false, { resume: false })
        audioManager.stop()
        return
      }

      audioManager.setLoop(baseline.loop)
      audioManager.setVolume(baseline.volume)
      audioManager.setEqEnabled(baseline.eqEnabled)
      audioManager.setEqualizer(baseline.equalizer)
      audioManager.setReverbEnabled(baseline.reverbEnabled)
      audioManager.setReverbDetail(baseline.reverbDetail)
      audioManager.setCompressorEnabled(baseline.compressorEnabled)
      audioManager.setCompressorDetail(baseline.compressorDetail)
      audioManager.loadHeroTrack({
        heroId: baseline.heroId,
        heroName: baseline.heroName,
        trackUrl: baseline.trackUrl,
        duration: baseline.duration || 0,
        autoPlay: false,
        loop: baseline.loop,
      })
      if (baseline.enabled) {
        audioManager.setEnabled(true, { resume: false })
        if (baseline.isPlaying) {
          audioManager.play().catch(() => {})
        }
      } else {
        audioManager.setEnabled(false, { resume: false })
        audioManager.stop()
      }
    }
  }, [audioManager])

  useEffect(() => {
    if (!audioManager) return

    const profile = activeAudioProfile || null
    const trackUrl = activeBgmUrl || profile?.bgmUrl || null

    if (!trackUrl) {
      audioManager.setEqEnabled(false)
      audioManager.setReverbEnabled(false)
      audioManager.setCompressorEnabled(false)
      audioManager.setEnabled(false, { resume: false })
      audioManager.stop()
      return
    }

    audioManager.setLoop(true)
    audioManager.setEnabled(true, { resume: false })
    if (profile?.equalizer) {
      audioManager.setEqEnabled(true)
      audioManager.setEqualizer({
        low: Number(profile.equalizer.low) || 0,
        mid: Number(profile.equalizer.mid) || 0,
        high: Number(profile.equalizer.high) || 0,
      })
    } else {
      audioManager.setEqEnabled(false)
      audioManager.setEqualizer({ low: 0, mid: 0, high: 0 })
    }

    if (profile?.reverb) {
      const mix = Number.isFinite(Number(profile.reverb.mix)) ? Number(profile.reverb.mix) : 0.3
      const decay = Number.isFinite(Number(profile.reverb.decay)) ? Number(profile.reverb.decay) : 1.8
      audioManager.setReverbEnabled(true)
      audioManager.setReverbDetail({ mix, decay })
    } else {
      audioManager.setReverbEnabled(false)
      audioManager.setReverbDetail({ mix: 0.3, decay: 1.8 })
    }

    if (profile?.compressor) {
      const threshold = Number.isFinite(Number(profile.compressor.threshold))
        ? Number(profile.compressor.threshold)
        : -28
      const ratio = Number.isFinite(Number(profile.compressor.ratio))
        ? Number(profile.compressor.ratio)
        : 2.5
      const release = Number.isFinite(Number(profile.compressor.release))
        ? Number(profile.compressor.release)
        : 0.25
      audioManager.setCompressorEnabled(true)
      audioManager.setCompressorDetail({ threshold, ratio, release })
    } else {
      audioManager.setCompressorEnabled(false)
      audioManager.setCompressorDetail({ threshold: -28, ratio: 2.5, release: 0.25 })
    }

    audioManager.loadHeroTrack({
      heroId: profile?.heroId || null,
      heroName: profile?.heroName || '',
      trackUrl,
      duration: Number(profile?.bgmDuration ?? activeBgmDuration ?? 0) || 0,
      autoPlay: true,
      loop: true,
    })
  }, [audioManager, activeAudioProfile, activeBgmUrl, activeBgmDuration])

  useEffect(() => {
    if (preflight) {
      timeoutTrackerRef.current = { lastProcessed: null, misses: 0 }
      autoAdvanceRemainingRef.current = 0
      autoAdvanceRunningRef.current = false
      setTimeoutNotice('')
      autoStartedRef.current = false
    }
  }, [preflight])

  useEffect(() => {
    if (loading || !preflight || autoStartedRef.current || !game) {
      return
    }
    autoStartedRef.current = true
    Promise.resolve(handleStart())
  }, [loading, preflight, game, handleStart])

  useEffect(() => {
    if (preflight) return
    if (turn == null || timeRemaining == null) return

    if (timeRemaining > 0) {
      if (timeoutNotice) {
        setTimeoutNotice('')
      }
      return
    }

    if (timeoutTrackerRef.current.lastProcessed === turn) {
      return
    }

    timeoutTrackerRef.current.lastProcessed = turn
    timeoutTrackerRef.current.misses += 1

    if (timeoutTrackerRef.current.misses === 1) {
      setTimeoutNotice('시간 제한을 초과했습니다. 다음 턴부터 서둘러 주세요!')
      return
    }

    setTimeoutNotice('시간 초과가 반복돼 다음 두 턴은 자동으로 진행됩니다.')
    timeoutTrackerRef.current.misses = 0
    autoAdvanceRemainingRef.current = 2
    if (!autoAdvanceRunningRef.current) {
      autoAdvanceRunningRef.current = true
      Promise.resolve(advanceWithAi()).finally(() => {
        autoAdvanceRunningRef.current = false
      })
    }
  }, [preflight, turn, timeRemaining, advanceWithAi, timeoutNotice])

  useEffect(() => {
    if (preflight) return
    if (autoAdvanceRemainingRef.current <= 0) return
    if (!canSubmitAction) return
    if (autoAdvanceRunningRef.current) return

    autoAdvanceRunningRef.current = true
    Promise.resolve(advanceWithAi()).finally(() => {
      autoAdvanceRemainingRef.current = Math.max(0, autoAdvanceRemainingRef.current - 1)
      autoAdvanceRunningRef.current = false
    })
  }, [preflight, canSubmitAction, advanceWithAi])

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

  const consensusActive = Boolean(consensus?.active)
  const participantCount = participants.length
  const rawRequired = consensusActive ? consensus?.required ?? participantCount : participantCount
  const consensusThreshold = consensusActive
    ? Math.max(1, consensus?.threshold ?? Math.ceil(rawRequired * 0.8))
    : Math.max(1, Math.ceil(Math.max(participantCount, 1) * 0.8))
  const consensusApproved = consensusActive
    ? Math.min(consensus?.count ?? 0, consensusThreshold)
    : 0
  const nextButtonDisabled =
    preflight || isAdvancing || (consensusActive ? !consensus?.viewerEligible : false)
  const consensusStatusText = consensusActive
    ? `다음 진행 동의 ${consensusApproved}/${consensusThreshold}명 · ${
        consensus?.viewerEligible
          ? consensus?.viewerHasConsented
            ? '내 동의 완료'
            : '내 동의 필요'
          : '관전자'
      }`
    : ''
  const manualModeNotice = game?.realtime_match
    ? ''
    : '실시간 매칭이 꺼진 게임에서는 서버에 API 키가 저장되지 않으며, 세션을 시작한 본인이 이 화면에 입력한 키로만 AI 호출이 처리됩니다.'

  const manualDisabled = preflight || !canSubmitAction
  const manualDisabledReason = manualDisabled
    ? preflight
      ? '게임을 먼저 시작해야 합니다.'
      : '현재 차례의 플레이어만 응답을 제출할 수 있습니다.'
    : ''
  const timerLabel = typeof timeRemaining === 'number'
    ? `${Math.max(timeRemaining, 0).toString().padStart(2, '0')}초 남음`
    : turnTimerSeconds
    ? `제한 ${turnTimerSeconds}초`
    : '대기 중'
  const nextButtonLabel = isAdvancing ? '진행 중…' : '다음으로 진행'

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
          advanceDisabled={false}
          advanceLabel={undefined}
          consensus={consensus}
          isStarting={isStarting}
          startDisabled={loading || Boolean(apiKeyCooldown?.active)}
          showAdvance={false}
        />

        <StatusBanner message={bannerMessage} />

        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => setHistoryOpen(true)}
            aria-expanded={historyOpen}
          >
            히스토리 열기
          </button>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => setRosterOpen(true)}
            aria-expanded={rosterOpen}
          >
            참가자 보기
          </button>
        </div>

        {consensusStatusText || timeoutNotice ? (
          <div className={styles.noticeStack}>
            {consensusStatusText ? (
              <div className={styles.consensusNotice}>{consensusStatusText}</div>
            ) : null}
            {timeoutNotice ? (
              <div className={styles.timeoutNotice}>{timeoutNotice}</div>
            ) : null}
          </div>
        ) : null}

        <div className={styles.stageColumn}>
          <section className={styles.stageMain}>
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
              realtimeLockNotice={
                game?.realtime_match
                  ? '실시간 매칭 중에는 세션을 시작한 뒤 API 버전을 변경할 수 없습니다.'
                  : ''
              }
              apiKeyNotice={manualModeNotice}
              currentActor={currentActor}
              timeRemaining={timeRemaining}
              turnTimerSeconds={turnTimerSeconds}
            />
          </section>

          <section
            className={`${styles.manualPanel} ${
              manualDisabled ? styles.manualPanelDisabled : styles.manualPanelActive
            }`}
          >
            <ManualResponsePanel
              manualResponse={manualResponse}
              onChange={setManualResponse}
              onManualAdvance={advanceWithManual}
              onAiAdvance={advanceWithAi}
              isAdvancing={isAdvancing}
              disabled={manualDisabled}
              disabledReason={manualDisabledReason}
              timeRemaining={timeRemaining}
              turnTimerSeconds={turnTimerSeconds}
            />
          </section>

          <section className={styles.nextControls}>
            <div className={styles.nextStatus}>
              <span className={styles.nextTimer}>{timerLabel}</span>
              {consensusActive ? (
                <span className={styles.nextConsensus}>
                  {`동의 ${consensusApproved}/${consensusThreshold}`}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.nextButton}
              onClick={advanceWithAi}
              disabled={nextButtonDisabled}
            >
              {nextButtonLabel}
            </button>
          </section>
        </div>
      </div>

      {historyOpen ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.overlayPanel}>
            <div className={styles.overlayHeader}>
              <h3>히스토리</h3>
              <button type="button" onClick={() => setHistoryOpen(false)}>
                닫기
              </button>
            </div>
            <div className={styles.overlayBody}>
              <LogsPanel logs={logs} aiMemory={aiMemory} playerHistories={playerHistories} />
            </div>
          </div>
        </div>
      ) : null}

      {rosterOpen ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.overlayPanel}>
            <div className={styles.overlayHeader}>
              <h3>참여자 정보</h3>
              <button type="button" onClick={() => setRosterOpen(false)}>
                닫기
              </button>
            </div>
            <div className={styles.overlayBody}>
              <RosterPanel participants={participants} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// Start client entry point that orchestrates the in-battle panels.
