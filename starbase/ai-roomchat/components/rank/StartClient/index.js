'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { getHeroAudioManager } from '@/lib/audio/heroAudioManager'

import HeaderControls from './HeaderControls'
import LogsPanel from './LogsPanel'
import ManualResponsePanel from './ManualResponsePanel'
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

function ParticipantTile({ participant }) {
  if (!participant) {
    return null
  }

  const hero = participant.hero || {}
  const image = hero.image_url
  const name = hero.name || '이름 없음'
  const role = participant.role || '미지정'
  const status = participant.status || '대기'

  return (
    <li className={styles.rosterCard}>
      {image ? (
        <img className={styles.rosterAvatar} src={image} alt={name} />
      ) : (
        <div className={styles.rosterAvatarPlaceholder} />
      )}
      <div className={styles.rosterMeta}>
        <span className={styles.rosterName}>{name}</span>
        <span className={styles.rosterRole}>{role}</span>
        <span className={styles.rosterStatus}>{status}</span>
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
    activeAudioProfile,
    activeHero,
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
  const audioManager = useMemo(() => getHeroAudioManager(), [])
  const baselineAudioProfileRef = useRef(null)

  const splitParticipants = useMemo(() => {
    const left = []
    const right = []
    participants.forEach((participant, index) => {
      if (index % 2 === 0) {
        left.push(participant)
      } else {
        right.push(participant)
      }
    })
    return { left, right }
  }, [participants])

  const applyAudioProfile = useCallback(
    (profile) => {
      if (!audioManager || !profile) return
      if (Object.prototype.hasOwnProperty.call(profile, 'eqEnabled')) {
        audioManager.setEqEnabled(profile.eqEnabled)
      }
      if (profile.equalizer) {
        audioManager.setEqualizer(profile.equalizer)
      }
      if (Object.prototype.hasOwnProperty.call(profile, 'reverbEnabled')) {
        audioManager.setReverbEnabled(profile.reverbEnabled)
      }
      if (profile.reverbDetail) {
        audioManager.setReverbDetail(profile.reverbDetail)
      }
      if (Object.prototype.hasOwnProperty.call(profile, 'compressorEnabled')) {
        audioManager.setCompressorEnabled(profile.compressorEnabled)
      }
      if (profile.compressorDetail) {
        audioManager.setCompressorDetail(profile.compressorDetail)
      }
    },
    [audioManager],
  )

  useEffect(() => {
    if (!audioManager) return undefined
    if (!baselineAudioProfileRef.current) {
      const snapshot = audioManager.getState()
      baselineAudioProfileRef.current = {
        eqEnabled: snapshot.eqEnabled,
        equalizer: { ...snapshot.equalizer },
        reverbEnabled: snapshot.reverbEnabled,
        reverbDetail: { ...snapshot.reverbDetail },
        compressorEnabled: snapshot.compressorEnabled,
        compressorDetail: { ...snapshot.compressorDetail },
      }
    }

    return () => {
      audioManager.setEnabled(false, { resume: false })
      audioManager.stop()
      const baseline = baselineAudioProfileRef.current
      if (baseline) {
        applyAudioProfile(baseline)
      }
    }
  }, [audioManager, applyAudioProfile])

  useEffect(() => {
    if (!audioManager) return
    if (activeAudioProfile) {
      applyAudioProfile(activeAudioProfile)
    } else if (baselineAudioProfileRef.current) {
      applyAudioProfile(baselineAudioProfileRef.current)
    }
  }, [audioManager, activeAudioProfile, applyAudioProfile])

  useEffect(() => {
    if (!audioManager) return undefined

    if (!activeBgmUrl) {
      audioManager.setEnabled(false, { resume: false })
      audioManager.stop()
      return undefined
    }

    const durationHint = Number.isFinite(activeHero?.bgm_duration_seconds)
      ? activeHero.bgm_duration_seconds
      : 0
    let cancelled = false

    audioManager
      .loadHeroTrack({
        heroId: activeHero?.id || null,
        heroName: activeHero?.name || '',
        trackUrl: activeBgmUrl,
        duration: durationHint || 0,
        autoPlay: true,
        loop: true,
      })
      .then(() => {
        if (cancelled) return
        audioManager.setLoop(true)
        audioManager.setEnabled(true)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [
    audioManager,
    activeBgmUrl,
    activeHero?.id,
    activeHero?.name,
    activeHero?.bgm_duration_seconds,
  ])

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
        {timeoutNotice ? <div className={styles.timeoutNotice}>{timeoutNotice}</div> : null}

        <div className={styles.mainLayout}>
          <aside className={styles.rosterColumn}>
            <h2 className={styles.rosterTitle}>왼쪽 슬롯</h2>
            <ul className={styles.rosterList}>
              {splitParticipants.left.length ? (
                splitParticipants.left.map((participant) => (
                  <ParticipantTile
                    key={participant.id || participant.hero_id}
                    participant={participant}
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
                splitParticipants.right.map((participant) => (
                  <ParticipantTile
                    key={participant.id || participant.hero_id}
                    participant={participant}
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
