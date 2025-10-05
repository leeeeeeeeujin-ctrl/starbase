"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/router"

import styles from "./StartClient.module.css"
import { loadGameBundle } from "./engine/loadGameBundle"
import { supabase } from "../../../lib/supabase"

function buildBackgroundStyle(imageUrl) {
  if (!imageUrl) {
    return { backgroundColor: "#0f172a" }
  }
  return {
    backgroundImage: `linear-gradient(rgba(15,23,42,0.82), rgba(15,23,42,0.94)), url(${imageUrl})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  }
}

function formatRole(role) {
  if (!role) return "역할 미지정"
  return role
}

function formatSlotNumber(slotNo, fallbackIndex) {
  const base = slotNo ?? fallbackIndex ?? null
  if (base == null) return "슬롯 미지정"
  return `슬롯 ${base + 1}`
}

function sanitizeTemplate(template) {
  if (!template) return "템플릿 내용이 비어 있습니다."
  const trimmed = String(template).trim()
  if (!trimmed) return "템플릿 내용이 비어 있습니다."
  return trimmed
}

function useGameBundle(gameId, { enabled = true } = {}) {
  const [state, setState] = useState({ loading: true, error: null, bundle: null })

  useEffect(() => {
    let active = true

    if (!enabled) {
      setState((prev) => ({ ...prev, loading: true }))
      return () => {
        active = false
      }
    }

    if (!gameId) {
      setState({ loading: false, error: new Error("게임 ID가 없습니다."), bundle: null })
      return () => {
        active = false
      }
    }

    setState((prev) => ({ ...prev, loading: true, error: null }))

    loadGameBundle(supabase, gameId)
      .then((bundle) => {
        if (!active) return
        setState({ loading: false, error: null, bundle })
      })
      .catch((error) => {
        if (!active) return
        setState({ loading: false, error, bundle: null })
      })

    return () => {
      active = false
    }
  }, [enabled, gameId])

  return state
}

function PromptList({ nodes }) {
  if (!nodes.length) {
    return <p className={styles.emptyMessage}>연결된 프롬프트 슬롯이 없습니다.</p>
  }

  return (
    <ul className={styles.promptList}>
      {nodes.map((node, index) => {
        const slotLabel = formatSlotNumber(node?.slot_no, index)
        const roleLabel = node?.slot_type === "player" ? "플레이어" : node?.slot_type === "gm" ? "GM" : "AI"
        const template = sanitizeTemplate(node?.template)
        const manualGlobal = node?.options?.manual_vars_global?.length || 0
        const manualLocal = node?.options?.manual_vars_local?.length || 0
        const activeGlobal = node?.options?.active_vars_global?.length || 0
        const activeLocal = node?.options?.active_vars_local?.length || 0
        const totalManual = manualGlobal + manualLocal
        const totalActive = activeGlobal + activeLocal

        return (
          <li key={node?.id || `${slotLabel}-${index}`} className={styles.promptCard}>
            <header className={styles.promptCardHeader}>
              <div className={styles.promptSlot}>{slotLabel}</div>
              <div className={styles.promptMeta}>
                <span>{roleLabel}</span>
                {node?.is_start ? <span className={styles.promptStart}>시작 슬롯</span> : null}
              </div>
            </header>
            <pre className={styles.promptTemplate}>{template}</pre>
            <footer className={styles.promptFooter}>
              <span>수동 변수 {totalManual}개</span>
              <span>자동 활성 {totalActive}개</span>
            </footer>
          </li>
        )
      })}
    </ul>
  )
}

function ParticipantStrip({ participants }) {
  if (!participants.length) {
    return <p className={styles.emptyMessage}>등록된 참가자가 없습니다.</p>
  }

  return (
    <div className={styles.participantStrip}>
      {participants.map((participant, index) => {
        const hero = participant?.hero || {}
        const slotLabel = formatSlotNumber(participant?.slot_no, index)
        const abilities = [hero?.ability1, hero?.ability2, hero?.ability3, hero?.ability4].filter(Boolean)
        return (
          <article key={participant?.id || `${participant?.owner_id}-${index}`} className={styles.participantCard}>
            <div className={styles.participantHeader}>
              <span className={styles.participantSlot}>{slotLabel}</span>
              <span className={styles.participantRole}>{formatRole(participant?.role)}</span>
            </div>
            <h3 className={styles.participantName}>{hero?.name || "이름 없는 영웅"}</h3>
            {participant?.status ? (
              <p className={styles.participantStatus}>상태 {participant.status}</p>
            ) : null}
            {abilities.length ? (
              <ul className={styles.participantAbilities}>
                {abilities.map((ability, abilityIndex) => (
                  <li key={abilityIndex}>{ability}</li>
                ))}
              </ul>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}

export default function StartClient({ gameId: overrideGameId, onExit }) {
  const router = useRouter()
  const routerReady = router?.isReady ?? false
  const resolvedGameId = overrideGameId ?? (routerReady ? router.query.id : null)

  const { loading, error, bundle } = useGameBundle(resolvedGameId, {
    enabled: Boolean(overrideGameId) || routerReady,
  })

  const backgroundStyle = useMemo(
    () => buildBackgroundStyle(bundle?.game?.image_url),
    [bundle?.game?.image_url],
  )

  const promptNodes = useMemo(() => {
    if (!bundle?.graph?.nodes) return []
    return [...bundle.graph.nodes].sort((a, b) => {
      const aSlot = a?.slot_no ?? Number.POSITIVE_INFINITY
      const bSlot = b?.slot_no ?? Number.POSITIVE_INFINITY
      if (aSlot === bSlot) return 0
      return aSlot - bSlot
    })
  }, [bundle?.graph?.nodes])

  const participants = bundle?.participants || []
  const warnings = bundle?.warnings || []

  return (
    <div className={styles.root} style={backgroundStyle}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>{bundle?.game?.title || bundle?.game?.name || "메인 게임"}</h1>
            <p className={styles.subtitle}>
              {resolvedGameId ? `게임 ID: ${resolvedGameId}` : "게임 정보를 불러오지 못했습니다."}
            </p>
          </div>
          {onExit ? (
            <button type="button" className={styles.exitButton} onClick={onExit}>
              나가기
            </button>
          ) : null}
        </header>

        {loading ? <p className={styles.statusMessage}>게임 데이터를 불러오는 중입니다…</p> : null}
        {error ? (
          <div className={styles.errorBox}>
            <h2>데이터를 불러오지 못했습니다</h2>
            <p>{error.message}</p>
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            {warnings.length ? (
              <div className={styles.warningBox}>
                <h2>프롬프트 경고</h2>
                <ul>
                  {warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <section className={styles.promptPanel}>
              <div className={styles.panelHeader}>
                <h2>프롬프트 세트</h2>
                {bundle?.game?.prompt_set_id ? (
                  <span className={styles.panelMeta}>세트 ID {bundle.game.prompt_set_id}</span>
                ) : null}
              </div>
              <PromptList nodes={promptNodes} />
            </section>

            <section className={styles.participantPanel}>
              <div className={styles.panelHeader}>
                <h2>매칭된 참가자</h2>
                <span className={styles.panelMeta}>{participants.length}명</span>
              </div>
              <ParticipantStrip participants={participants} />
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
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
