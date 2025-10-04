'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

function formatStatusLabel(status) {
  if (!status) return '상태 미확인'
  const normalized = String(status).toLowerCase()
  if (['defeated', 'lost', '패배'].includes(normalized)) return '패배'
  if (['eliminated', 'retired', '탈락'].includes(normalized)) return '탈락'
  if (['pending', 'waiting'].includes(normalized)) return '대기 중'
  if (['active', 'alive', 'in_battle'].includes(normalized)) return '전투 중'
  return status
}

function getStatusClassName(status) {
  const normalized = String(status || '').toLowerCase()
  if (['defeated', 'lost', '패배'].includes(normalized)) {
    return styles.statusDefeated
  }
  if (['eliminated', 'retired', '탈락'].includes(normalized)) {
    return styles.statusEliminated
  }
  return ''
}

function formatWinRate(value) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const ratio = numeric > 1 ? numeric : numeric * 100
  const rounded = Math.round(ratio * 10) / 10
  return `${rounded}%`
}

function formatBattles(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  return `${numeric}전`
}

function formatScore(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return `점수 ${numeric}`
}

function buildParticipantStages(participant = {}) {
  const hero = participant.hero || {}
  const stages = []
  const name = hero.name || '이름 없는 영웅'
  const subtitleParts = []
  if (participant.role) {
    subtitleParts.push(`역할 ${participant.role}`)
  }
  subtitleParts.push(`상태 ${formatStatusLabel(participant.status)}`)
  stages.push({ title: name, subtitle: subtitleParts.join(' · ') })

  if (hero.description) {
    stages.push({ title: '설명', subtitle: hero.description })
  }

  for (let index = 1; index <= 4; index += 1) {
    const ability = hero[`ability${index}`]
    if (ability) {
      stages.push({ title: `능력 ${index}`, subtitle: ability })
    }
  }

  const statsParts = []
  const score = formatScore(participant.score)
  const battles = formatBattles(participant.battles ?? participant.total_battles)
  const winRate = formatWinRate(participant.win_rate ?? participant.winRate)
  if (score) statsParts.push(score)
  if (battles) statsParts.push(battles)
  if (winRate) statsParts.push(`승률 ${winRate}`)
  if (statsParts.length) {
    stages.push({ title: '전적', subtitle: statsParts.join(' · ') })
  }

  return stages
}

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
    realtimeEvents,
    realtimePresence,
    dropInSnapshot,
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
    autoAdvance,
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
  const [cardStages, setCardStages] = useState({})

  useEffect(() => {
    if (!participants || participants.length === 0) {
      setCardStages({})
      return
    }
    setCardStages((prev) => {
      const next = {}
      participants.forEach((participant, index) => {
        const key = String(
          participant.id ?? participant.hero_id ?? participant.hero?.id ?? index,
        )
        if (Object.prototype.hasOwnProperty.call(prev, key)) {
          next[key] = prev[key]
        }
      })
      return next
    })
  }, [participants])

  const participantCards = useMemo(() => {
    return participants.map((participant, index) => {
      const key = String(
        participant.id ?? participant.hero_id ?? participant.hero?.id ?? index,
      )
      const stages = buildParticipantStages(participant)
      const total = stages.length || 1
      const currentIndex = cardStages[key] ? cardStages[key] % total : 0
      const currentStage = stages[currentIndex] || stages[0] || {
        title: participant.hero?.name || '이름 없는 영웅',
        subtitle: '',
      }
      return {
        key,
        participant,
        stages,
        currentIndex,
        currentStage,
      }
    })
  }, [cardStages, participants])

  const handleCardStageAdvance = useCallback((cardKey, totalStages) => {
    if (!totalStages || totalStages <= 1) {
      return
    }
    setCardStages((prev) => {
      const next = { ...prev }
      const current = Number.isFinite(prev[cardKey]) ? prev[cardKey] : 0
      next[cardKey] = (current + 1) % totalStages
      return next
    })
  }, [])

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
      timeoutTrackerRef.current.misses = 0
      return
    }

    if (isAdvancing) return
    if (autoAdvanceRunningRef.current) return

    if (timeoutTrackerRef.current.lastProcessed === turn) {
      return
    }

    timeoutTrackerRef.current.lastProcessed = turn
    timeoutTrackerRef.current.misses = (timeoutTrackerRef.current.misses || 0) + 1
    setTimeoutNotice('시간이 만료되어 턴이 자동으로 진행됩니다.')

    autoAdvanceRunningRef.current = true
    Promise.resolve(autoAdvance()).finally(() => {
      autoAdvanceRunningRef.current = false
    })
  }, [preflight, turn, timeRemaining, timeoutNotice, autoAdvance, isAdvancing])

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
      <div className={styles.shell}>
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

        <section className={styles.stage}>
          <div className={styles.overlayButtons}>
            <button
              type="button"
              className={styles.overlayButton}
              onClick={() => setHistoryOpen(true)}
              aria-expanded={historyOpen}
            >
              히스토리
            </button>
            <button
              type="button"
              className={styles.overlayButton}
              onClick={() => setRosterOpen(true)}
              aria-expanded={rosterOpen}
            >
              참가자
            </button>
          </div>

          <div className={styles.stageInner}>
            <div className={styles.stageViewport}>
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

            <div
              className={`${styles.manualWrap} ${
                manualDisabled ? styles.manualWrapDisabled : styles.manualWrapActive
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
            </div>

            <div className={styles.nextControls}>
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
            </div>
          </div>
        </section>
      </div>

      <div className={styles.footerRail}>
        {participantCards.map(({ key, participant, stages, currentStage, currentIndex }) => {
          const statusClass = getStatusClassName(participant.status)
          const hasMultipleStages = stages.length > 1
          const overlayActive = currentIndex > 0
          const imageUrl = participant.hero?.image_url || ''
          return (
            <div key={key} className={`${styles.participantCard} ${statusClass}`}>
              <button
                type="button"
                onClick={() => handleCardStageAdvance(key, stages.length)}
                aria-label={`${participant.hero?.name || '참여자'} 정보 보기`}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={participant.hero?.name || '참여자 이미지'}
                    className={styles.participantImage}
                  />
                ) : (
                  <div
                    className={styles.participantImage}
                    style={{ background: 'rgba(30, 41, 59, 0.55)' }}
                  />
                )}
                <div
                  className={`${styles.participantOverlay} ${
                    overlayActive ? styles.participantOverlayActive : ''
                  }`}
                >
                  <div className={styles.participantTitle}>{currentStage.title}</div>
                  {currentStage.subtitle ? (
                    <div className={styles.participantSubtitle}>{currentStage.subtitle}</div>
                  ) : null}
                  {hasMultipleStages ? (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        color: 'rgba(148, 163, 184, 0.8)',
                      }}
                    >
                      탭하여 다음 정보 보기
                    </div>
                  ) : null}
                </div>
              </button>
            </div>
          )
        })}
        {participantCards.length === 0 ? (
          <div style={{ color: 'rgba(226, 232, 240, 0.75)', fontSize: 13 }}>
            참여자 정보를 불러오고 있습니다…
          </div>
        ) : null}
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
              <LogsPanel
                logs={logs}
                aiMemory={aiMemory}
                playerHistories={playerHistories}
                realtimeEvents={realtimeEvents}
              />
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
              <RosterPanel
                participants={participants}
                realtimePresence={realtimePresence}
                dropInSnapshot={dropInSnapshot}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// Start client entry point that orchestrates the in-battle panels.
