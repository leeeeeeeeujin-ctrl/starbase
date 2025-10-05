"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/router"

import styles from "./StartClient.module.css"
import { loadGameBundle } from "./engine/loadGameBundle"
import { supabase } from "../../../lib/supabase"
import { interpretPromptNode, buildParticipantSlotMap } from "@/lib/rank/promptInterpreter"

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

function describeSlotType(slotType) {
  switch (slotType) {
    case "player":
      return "플레이어"
    case "gm":
      return "GM"
    case "manual":
      return "수동 입력"
    case "system":
      return "시스템"
    default:
      return "AI"
  }
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

function formatBridgeCondition(condition) {
  if (!condition || typeof condition !== "object") {
    return "알 수 없는 조건"
  }

  const type = condition.type

  switch (type) {
    case "turn_gte":
      return `턴 ≥ ${condition.value ?? 0}`
    case "turn_lte":
      return `턴 ≤ ${condition.value ?? 0}`
    case "prev_ai_contains": {
      const scopeLabel =
        condition.scope === "all"
          ? "전체 응답"
          : condition.scope === "last1"
          ? "마지막 1줄"
          : condition.scope === "last5"
          ? "마지막 5줄"
          : "마지막 2줄"
      return `${scopeLabel}에 "${condition.value || ""}" 포함`
    }
    case "prev_prompt_contains": {
      const scopeLabel =
        condition.scope === "all"
          ? "프롬프트 전체"
          : condition.scope === "last2"
          ? "마지막 2줄"
          : "마지막 1줄"
      return `${scopeLabel}에 "${condition.value || ""}" 포함`
    }
    case "prev_ai_regex": {
      const flags = condition.flags ? `/${condition.flags}` : ""
      return `이전 응답 정규식 /${condition.pattern || ""}${flags}`
    }
    case "prev_ai_any_of":
      return `이전 응답이 다음 중 하나 포함: ${(condition.values || []).join(", ")}`
    case "prev_ai_all_of":
      return `이전 응답이 모두 포함: ${(condition.values || []).join(", ")}`
    case "prev_ai_count_gte":
      return `이전 응답 단어 ${condition.values?.length || 0}개 중 ${condition.count || 0}개 이상`
    case "visited_slot":
      return `슬롯 #${condition.slot_id ?? "?"} 경유`
    case "var_on": {
      const scopeLabel =
        condition.scope === "global"
          ? "전역"
          : condition.scope === "local"
          ? "로컬"
          : "전역+로컬"
      const modeLabel = condition.mode === "all" ? "모두 활성" : "하나 이상 활성"
      const names = (condition.names || []).join(", ") || "(변수 없음)"
      return `${scopeLabel} 변수 ${names} ${modeLabel}`
    }
    case "session_flag": {
      const flagName = condition.name || condition.flag || "세션 플래그"
      const expected =
        condition.value === undefined
          ? "ON"
          : condition.value
          ? "ON"
          : "OFF"
      return `세션 플래그 ${flagName} = ${expected}`
    }
    case "drop_in_recent": {
      const within = Number(condition.within_turns ?? condition.within ?? 0)
      if (within > 0) {
        return `최근 ${within}턴 이내 난입 존재`
      }
      return "현재 턴에 난입 발생"
    }
    case "drop_in_absent": {
      const after = Number(condition.after_turns ?? condition.turns ?? 0)
      if (after > 0) {
        return `난입 이후 ${after}턴 경과`
      }
      return "난입 없음"
    }
    case "brawl_enabled": {
      const state = condition.value === false ? "비활성" : "활성"
      return `난입 모드 ${state}`
    }
    case "win_count_gte":
      return `승수 ≥ ${condition.value ?? condition.count ?? 0}`
    case "win_count_lte":
      return `승수 ≤ ${condition.value ?? condition.count ?? 0}`
    case "win_count_eq":
      return `승수 = ${condition.value ?? condition.count ?? 0}`
    case "role_status": {
      const cmpLabel =
        condition.cmp === "lte" ? "≤" : condition.cmp === "eq" ? "=" : "≥"
      const status = condition.status || "alive"
      return `${condition.role || "역할"} ${status} ${cmpLabel} ${condition.value ?? 0}`
    }
    case "count": {
      const whoLabel =
        condition.who === "same"
          ? "같은 편"
          : condition.who === "other"
          ? "상대 편"
          : condition.who === "specific"
          ? `${condition.role || "특정 역할"}`
          : "전체"
      const cmpLabel =
        condition.cmp === "lte" ? "≤" : condition.cmp === "eq" ? "=" : "≥"
      return `${whoLabel} ${condition.status || "alive"} 수 ${cmpLabel} ${condition.value ?? 0}`
    }
    case "fallback":
      return "폴백"
    default:
      return `${type || "알 수 없는"} 조건`
  }
}

function formatBridgeConditions(data) {
  if (!data) return ["조건 없음"]
  const conditions = Array.isArray(data.conditions) ? data.conditions : []
  if (!conditions.length) {
    return [data.fallback ? "조건 없음 (폴백)" : "조건 없음"]
  }
  return conditions.map((condition) => formatBridgeCondition(condition))
}

function formatProbability(probability) {
  if (probability == null) return null
  const numeric = Number(probability)
  if (!Number.isFinite(numeric)) return null
  if (numeric >= 0.999) return "확률 100%"
  if (numeric <= 0) return "확률 0%"
  return `확률 ${Math.round(numeric * 100)}%`
}

function BridgeList({ edges, nodesById }) {
  const items = Array.isArray(edges) ? edges : []
  if (!items.length) {
    return <p className={styles.bridgeEmpty}>연결된 브릿지가 없습니다.</p>
  }

  return (
    <ul className={styles.bridgeList}>
      {items.map((edge) => {
        const data = edge?.data || {}
        const destination = nodesById?.get?.(String(edge?.to)) || null
        const destinationSlot = destination
          ? formatSlotNumber(destination.slot_no, null)
          : "대상 슬롯 없음"
        const destinationRole = destination
          ? describeSlotType(destination.slot_type)
          : "미정"
        const conditionLines = formatBridgeConditions(data)
        const metaParts = []
        const probabilityLabel = formatProbability(data.probability)
        if (probabilityLabel) {
          metaParts.push(probabilityLabel)
        }
        const priority = Number(data.priority ?? 0)
        metaParts.push(`우선순위 ${priority}`)
        if (Array.isArray(data.trigger_words) && data.trigger_words.length) {
          metaParts.push(`트리거: ${data.trigger_words.join(", ")}`)
        }
        if (data.action && data.action !== "continue") {
          metaParts.push(`동작: ${data.action}`)
        }

        return (
          <li
            key={edge?.id || `${edge?.from}-${edge?.to}`}
            className={styles.bridgeItem}
          >
            <div className={styles.bridgeHeader}>
              <span className={styles.bridgeDestination}>
                {destinationSlot} · {destinationRole}
              </span>
              <div className={styles.bridgeBadges}>
                {data.fallback ? (
                  <span className={`${styles.bridgeBadge} ${styles.bridgeBadgeFallback}`}>
                    폴백
                  </span>
                ) : null}
                {data.action && data.action !== "continue" ? (
                  <span className={styles.bridgeBadge}>{data.action}</span>
                ) : null}
              </div>
            </div>
            <ul className={styles.bridgeConditions}>
              {conditionLines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
            <div className={styles.bridgeMeta}>{metaParts.join(" · ")}</div>
          </li>
        )
      })}
    </ul>
  )
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

function PromptList({ nodes, game, slotsMap, edgesBySource, nodesById }) {
  if (!nodes.length) {
    return <p className={styles.emptyMessage}>연결된 프롬프트 슬롯이 없습니다.</p>
  }

  return (
    <ul className={styles.promptList}>
      {nodes.map((node, index) => {
        const slotLabel = formatSlotNumber(node?.slot_no, index)
        const roleLabel = describeSlotType(node?.slot_type)
        const template = sanitizeTemplate(node?.template)
        const manualGlobal = node?.options?.manual_vars_global?.length || 0
        const manualLocal = node?.options?.manual_vars_local?.length || 0
        const activeGlobal = node?.options?.active_vars_global?.length || 0
        const activeLocal = node?.options?.active_vars_local?.length || 0
        const totalManual = manualGlobal + manualLocal
        const totalActive = activeGlobal + activeLocal
        const interpretation = interpretPromptNode({ game, node, slotsMap })
        const globalGuidelines = interpretation.sections?.globalVariables?.length || 0
        const localGuidelines = interpretation.sections?.localVariables?.length || 0
        const bridges = edgesBySource?.get?.(String(node?.id)) || []

        return (
          <li key={node?.id || `${slotLabel}-${index}`} className={styles.promptCard}>
            <header className={styles.promptCardHeader}>
              <div className={styles.promptSlot}>{slotLabel}</div>
              <div className={styles.promptMeta}>
                <span>{roleLabel}</span>
                {node?.is_start ? <span className={styles.promptStart}>시작 슬롯</span> : null}
              </div>
            </header>
            <div className={styles.promptSections}>
              <div>
                <h3 className={styles.promptSectionLabel}>규칙 · 변수 요약</h3>
                <pre className={styles.promptRules}>{interpretation.rulesBlock}</pre>
              </div>
              <div>
                <h3 className={styles.promptSectionLabel}>최종 전달 프롬프트</h3>
                <pre className={styles.promptTemplate}>{interpretation.promptBody}</pre>
              </div>
              <div>
                <h3 className={styles.promptSectionLabel}>연결 브릿지</h3>
                <BridgeList edges={bridges} nodesById={nodesById} />
              </div>
              <details className={styles.promptRawToggle}>
                <summary>원본 템플릿 보기</summary>
                <pre className={styles.promptRaw}>{template}</pre>
              </details>
            </div>
            <footer className={styles.promptFooter}>
              <span>수동 변수 {totalManual}개</span>
              <span>자동 활성 {totalActive}개</span>
              <span>전역 지침 {globalGuidelines}개</span>
              <span>로컬 지침 {localGuidelines}개</span>
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

  const graphNodesById = useMemo(() => {
    const map = new Map()
    for (const node of bundle?.graph?.nodes || []) {
      if (!node?.id) continue
      map.set(String(node.id), node)
    }
    return map
  }, [bundle?.graph?.nodes])

  const graphEdgesBySource = useMemo(() => {
    const map = new Map()
    for (const edge of bundle?.graph?.edges || []) {
      if (!edge?.from) continue
      const key = String(edge.from)
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key).push(edge)
    }

    map.forEach((list) => {
      list.sort((a, b) => {
        const aFallback = a?.data?.fallback ? 1 : 0
        const bFallback = b?.data?.fallback ? 1 : 0
        if (aFallback !== bFallback) {
          return aFallback - bFallback
        }

        const aPriority = Number(a?.data?.priority ?? 0)
        const bPriority = Number(b?.data?.priority ?? 0)
        if (aPriority !== bPriority) {
          return bPriority - aPriority
        }

        const aProbability = Number(a?.data?.probability ?? 1)
        const bProbability = Number(b?.data?.probability ?? 1)
        if (aProbability !== bProbability) {
          return bProbability - aProbability
        }

        const aTo = String(a?.to ?? "")
        const bTo = String(b?.to ?? "")
        return aTo.localeCompare(bTo)
      })
    })

    return map
  }, [bundle?.graph?.edges])

  const participants = bundle?.participants || []
  const warnings = bundle?.warnings || []
  const participantSlotsMap = useMemo(
    () => buildParticipantSlotMap(participants),
    [participants],
  )

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
              <PromptList
                nodes={promptNodes}
                game={bundle?.game}
                slotsMap={participantSlotsMap}
                edgesBySource={graphEdgesBySource}
                nodesById={graphNodesById}
              />
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
