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

function describeParticipantSource(participant) {
  const source =
    participant?.match_source || (participant?.standin ? 'participant_pool' : 'realtime_queue')
  if (source === 'participant_pool') {
    return { label: '대역', className: styles.participantSourceStandin }
  }
  if (source === 'realtime_queue') {
    return { label: '실시간', className: styles.participantSourceRealtime }
  }
  return { label: '알 수 없음', className: styles.participantSourceUnknown }
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
        const roleLabel =
          node?.slot_type === "player" ? "플레이어" : node?.slot_type === "gm" ? "GM" : "AI"
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
        const sourceInfo = describeParticipantSource(participant)
        return (
          <article key={participant?.id || `${participant?.owner_id}-${index}`} className={styles.participantCard}>
            <div className={styles.participantHeader}>
              <span className={styles.participantSlot}>{slotLabel}</span>
              <span className={styles.participantRole}>{formatRole(participant?.role)}</span>
              <span className={`${styles.participantSourceBadge} ${sourceInfo.className}`}>
                {sourceInfo.label}
              </span>
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
