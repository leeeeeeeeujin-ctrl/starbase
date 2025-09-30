'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import HeaderControls from './HeaderControls'
import LogsPanel from './LogsPanel'
import ManualResponsePanel from './ManualResponsePanel'
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

function normalizeStatus(status) {
  const raw = typeof status === 'string' ? status.trim().toLowerCase() : ''
  if (!raw) {
    return { label: '진행 중', tone: 'neutral' }
  }

  if (['victory', 'won', 'winner', 'champion'].includes(raw)) {
    return { label: '승리', tone: 'victory' }
  }

  if (['defeated', 'lost', 'dead', 'eliminated', 'out'].includes(raw)) {
    return { label: '패배', tone: 'defeated' }
  }

  if (['retired', 'retreat', 'retreated', 'withdrawn'].includes(raw)) {
    return { label: '탈락', tone: 'retired' }
  }

  if (['waiting', 'queued', 'standby', 'pending'].includes(raw)) {
    return { label: '대기 중', tone: 'neutral' }
  }

  if (['active', 'alive', 'playing', 'in_progress'].includes(raw)) {
    return { label: '진행 중', tone: 'neutral' }
  }

  return { label: status || '진행 중', tone: 'neutral' }
}

function ParticipantTile({ participant, isActive, isUserAction }) {
  if (!participant) {
    return null
  }

  const hero = participant.hero || {}
  const image = hero.image_url
  const name = hero.name || '이름 없음'
  const role = participant.role || '미지정'
  const { label: statusLabel, tone } = normalizeStatus(participant.status)

  const cardClassNames = [styles.rosterCard]
  if (isActive) {
    cardClassNames.push(styles.rosterCardActive)
    if (isUserAction) {
      cardClassNames.push(styles.rosterCardUserAction)
    }
  }

  const statusClassNames = [styles.rosterStatus]
  if (tone === 'victory') {
    statusClassNames.push(styles.rosterStatusVictory)
  } else if (tone === 'defeated') {
    statusClassNames.push(styles.rosterStatusDefeated)
  } else if (tone === 'retired') {
    statusClassNames.push(styles.rosterStatusRetired)
  }

  return (
    <li className={cardClassNames.join(' ')}>
      {isActive ? (
        <span className={styles.rosterBadge}>{isUserAction ? '플레이어 턴' : 'AI 턴'}</span>
      ) : null}
      {image ? (
        <img className={styles.rosterAvatar} src={image} alt={name} />
      ) : (
        <div className={styles.rosterAvatarPlaceholder} />
      )}
      <div className={styles.rosterMeta}>
        <span className={styles.rosterName}>{name}</span>
        <span className={styles.rosterRole}>{role}</span>
        <span className={statusClassNames.join(' ')}>{statusLabel}</span>
      </div>
    </li>
  )
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

  const splitParticipants = useMemo(() => {
    const left = []
    const right = []
    participants.forEach((participant, index) => {
      const entry = { participant, index }
      if (index % 2 === 0) {
        left.push(entry)
      } else {
        right.push(entry)
      }
    })
    return { left, right }
  }, [participants])

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
    handleStart()
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
  const consensusRequired = consensusActive ? consensus?.required ?? 0 : 0
  const consensusApproved = consensusActive
    ? Math.min(consensus?.count ?? 0, consensusRequired)
    : 0
  const advanceDisabled = preflight
    ? false
    : consensusActive
    ? !consensus?.viewerEligible
    : !canSubmitAction
  const advanceLabel = consensusActive
    ? `동의 ${consensusApproved}/${consensusRequired}`
    : undefined
  const consensusStatusText = consensusActive
    ? `동의 현황 ${consensusApproved}/${consensusRequired}명 · ${
        consensus?.viewerHasConsented ? '내 동의 완료' : '내 동의 필요'
      }`
    : ''

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
          advanceDisabled={advanceDisabled}
          advanceLabel={advanceLabel}
          consensus={consensus}
        />

        <StatusBanner message={statusMessage} />
        {consensusStatusText ? (
          <div className={styles.consensusNotice}>{consensusStatusText}</div>
        ) : null}
        {timeoutNotice ? <div className={styles.timeoutNotice}>{timeoutNotice}</div> : null}

        <div className={styles.mainLayout}>
          <aside className={styles.rosterColumn}>
            <h2 className={styles.rosterTitle}>왼쪽 슬롯</h2>
            <ul className={styles.rosterList}>
              {splitParticipants.left.length ? (
                splitParticipants.left.map(({ participant, index }) => (
                  <ParticipantTile
                    key={participant?.id || participant?.hero_id || index}
                    participant={participant}
                    isActive={currentActor?.slotIndex === index}
                    isUserAction={
                      currentActor?.slotIndex === index && !!currentActor?.isUserAction
                    }
                  />
                ))
              ) : (
                <li className={styles.rosterEmpty}>참여자가 없습니다.</li>
              )}
            </ul>
          </aside>

          <main className={styles.playColumn}>
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

            <div className={styles.playStack}>
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
          </main>

          <aside className={styles.rosterColumn}>
            <h2 className={styles.rosterTitle}>오른쪽 슬롯</h2>
            <ul className={styles.rosterList}>
              {splitParticipants.right.length ? (
                splitParticipants.right.map(({ participant, index }) => (
                  <ParticipantTile
                    key={participant?.id || participant?.hero_id || `r-${index}`}
                    participant={participant}
                    isActive={currentActor?.slotIndex === index}
                    isUserAction={
                      currentActor?.slotIndex === index && !!currentActor?.isUserAction
                    }
                  />
                ))
              ) : (
                <li className={styles.rosterEmpty}>참여자가 없습니다.</li>
              )}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  )
}

// Start client entry point that orchestrates the in-battle panels.
