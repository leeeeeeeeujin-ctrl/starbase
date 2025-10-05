"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/router"

import styles from "./NonRealtimeConsole.module.css"

import { supabase } from "@/lib/supabase"
import { loadGameBundle } from "@/components/rank/StartClient/engine/loadGameBundle"
import { buildParticipantSlotMap, interpretPromptNode } from "@/lib/rank/promptInterpreter"
import { createAiHistory } from "@/lib/history"
import { parseOutcome } from "@/lib/promptEngine"
import { chooseNext } from "@/lib/bridgeEval"
import { makeCallModel } from "@/lib/modelClient"

function normalizeParticipant(participant) {
  if (!participant) return null
  const hero = participant.hero || {}
  return {
    ...participant,
    hero: {
      id: hero.id ?? null,
      name: hero.name || "",
      description: hero.description || "",
      image_url: hero.image_url || "",
      background_url: hero.background_url || "",
      ability1: hero.ability1 || "",
      ability2: hero.ability2 || "",
      ability3: hero.ability3 || "",
      ability4: hero.ability4 || "",
    },
  }
}

function ensureArray(value) {
  if (!Array.isArray(value)) return []
  return value
}

function formatSlotLabel(node) {
  if (!node) return ""
  const no = node.slot_no
  if (no == null) return "슬롯 미지정"
  return `슬롯 ${Number(no) + 1}`
}

function formatOutcome(outcome) {
  if (!outcome) return "결과 정보를 파싱하지 못했습니다."
  const parts = []
  if (outcome.lastLine) {
    parts.push(`마지막 줄: ${outcome.lastLine}`)
  }
  if (outcome.variables?.length) {
    parts.push(`변수: ${outcome.variables.join(", ")}`)
  }
  if (outcome.actors?.length) {
    parts.push(`주역: ${outcome.actors.join(", ")}`)
  }
  return parts.length ? parts.join(" · ") : "결과가 비어 있습니다."
}

function mapEdgeForEvaluation(edge) {
  if (!edge) return null
  const fromSlotId = edge.from_slot_id ?? edge.from ?? edge.source ?? edge.data?.from_slot_id
  const toSlotId = edge.to_slot_id ?? edge.to ?? edge.target ?? edge.data?.to_slot_id
  return {
    ...edge,
    from_slot_id: fromSlotId != null ? String(fromSlotId) : null,
    to_slot_id: toSlotId != null ? String(toSlotId) : null,
    data: {
      ...(edge.data || {}),
      conditions: edge.data?.conditions ?? edge.conditions ?? [],
      probability:
        edge.data?.probability ?? edge.probability ?? edge.data?.probability ?? 1,
      fallback: edge.data?.fallback ?? edge.fallback ?? false,
      action: edge.data?.action ?? edge.action ?? "continue",
    },
  }
}

export default function NonRealtimeConsole() {
  const router = useRouter()
  const [gameIdInput, setGameIdInput] = useState("")
  const [bundle, setBundle] = useState(null)
  const [loadError, setLoadError] = useState("")
  const [loading, setLoading] = useState(false)
  const [operatorKey, setOperatorKey] = useState("")
  const [participants, setParticipants] = useState([])
  const [currentNodeId, setCurrentNodeId] = useState(null)
  const [turns, setTurns] = useState([])
  const [historyVersion, setHistoryVersion] = useState(0)
  const [pendingTurn, setPendingTurn] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [sessionEnded, setSessionEnded] = useState(false)

  const aiHistory = useMemo(() => createAiHistory(), [])
  const visitedSlotsRef = useRef(new Set())

  useEffect(() => {
    aiHistory.beginSession()
    setHistoryVersion((v) => v + 1)
  }, [aiHistory])

  useEffect(() => {
    if (!router.isReady) return
    const routeId = router.query?.id
    if (typeof routeId === "string" && routeId) {
      setGameIdInput(routeId)
    }
  }, [router.isReady, router.query?.id])

  const loadGame = useCallback(async () => {
    if (!gameIdInput) {
      setLoadError("게임 ID를 입력해 주세요.")
      return
    }
    setLoading(true)
    setLoadError("")
    setStatusMessage("")
    try {
      const loaded = await loadGameBundle(supabase, gameIdInput)
      setBundle(loaded)
      setParticipants(ensureArray(loaded.participants).map(normalizeParticipant))
      const startNode = loaded.graph?.nodes?.find((node) => node?.is_start)
      const fallbackNode = loaded.graph?.nodes?.[0] ?? null
      setCurrentNodeId(startNode?.id ?? fallbackNode?.id ?? null)
      setTurns([])
      visitedSlotsRef.current = new Set()
      aiHistory.beginSession()
      setHistoryVersion((v) => v + 1)
      setSessionEnded(false)
    } catch (error) {
      console.error("[NonRealtimeConsole] 게임 불러오기 실패", error)
      setLoadError(error?.message || "게임 정보를 불러오지 못했습니다.")
      setBundle(null)
      setParticipants([])
      setCurrentNodeId(null)
      setTurns([])
      visitedSlotsRef.current = new Set()
      aiHistory.beginSession()
      setHistoryVersion((v) => v + 1)
    } finally {
      setLoading(false)
    }
  }, [aiHistory, gameIdInput])

  useEffect(() => {
    if (router.isReady && router.query?.id && !bundle && !loading) {
      loadGame()
    }
  }, [bundle, loading, loadGame, router.isReady, router.query?.id])

  const slotsMap = useMemo(
    () => buildParticipantSlotMap(participants.map((participant) => ({ ...participant }))),
    [participants],
  )

  const historyText = useMemo(
    () => aiHistory.joinedText({ onlyPublic: false }),
    [aiHistory, historyVersion],
  )

  const currentNode = useMemo(() => {
    if (!bundle || !currentNodeId) return null
    return bundle.graph?.nodes?.find((node) => String(node.id) === String(currentNodeId)) ?? null
  }, [bundle, currentNodeId])

  const promptPreview = useMemo(() => {
    if (!bundle || !currentNode) return null
    try {
      return interpretPromptNode({
        game: bundle.game,
        node: currentNode,
        participants,
        slotsMap,
        historyText,
      })
    } catch (error) {
      console.error("[NonRealtimeConsole] 프롬프트 해석 실패", error)
      return null
    }
  }, [bundle, currentNode, participants, slotsMap, historyText])

  const handleParticipantChange = useCallback((index, field, value) => {
    setParticipants((prev) =>
      prev.map((participant, idx) => {
        if (idx !== index) return participant
        if (field === "name") {
          return { ...participant, hero: { ...participant.hero, name: value } }
        }
        if (field.startsWith("ability")) {
          return { ...participant, hero: { ...participant.hero, [field]: value } }
        }
        return participant
      }),
    )
  }, [])

  const handleRunTurn = useCallback(async () => {
    if (!bundle || !currentNode || !promptPreview) return
    if (!operatorKey.trim()) {
      setStatusMessage("운영 키를 입력해 주세요.")
      return
    }
    const nextTurnIndex = turns.length + 1
    setPendingTurn(true)
    setStatusMessage("")
    try {
      const callModel = makeCallModel({ getKey: () => operatorKey.trim() })
      const result = await callModel({
        system: promptPreview.rulesBlock,
        userText: promptPreview.promptBody,
      })
      if (!result?.ok) {
        throw new Error(result?.error || "AI 호출이 실패했습니다.")
      }
      const aiText = result.text || result.aiText || ""
      visitedSlotsRef.current.add(String(currentNode.id))
      aiHistory.push({ role: "user", content: promptPreview.promptBody, public: true })
      aiHistory.push({ role: "assistant", content: aiText, public: true })
      setHistoryVersion((v) => v + 1)

      const outcome = parseOutcome(aiText)
      const evaluatedEdges = ensureArray(bundle.graph?.edges)
        .map(mapEdgeForEvaluation)
        .filter(Boolean)

      const bridgeResult = chooseNext({
        currentSlotId: currentNode.id,
        edges: evaluatedEdges,
        context: {
          historyAiText: aiText,
          historyUserText: promptPreview.promptBody,
          visitedSlotIds: visitedSlotsRef.current,
          turn: nextTurnIndex,
        },
      })

      setTurns((prev) => [
        ...prev,
        {
          node: currentNode,
          prompt: promptPreview,
          responseText: aiText,
          outcome,
          bridge: bridgeResult,
        },
      ])

      if (bridgeResult?.nextSlotId) {
        setCurrentNodeId(String(bridgeResult.nextSlotId))
      } else if (bridgeResult?.action === "stop") {
        setSessionEnded(true)
        setStatusMessage("브릿지 액션이 stop으로 설정되어 세션을 종료했습니다.")
      } else if (!bridgeResult) {
        setStatusMessage("다음으로 진행할 브릿지를 찾지 못했습니다.")
      }
    } catch (error) {
      console.error("[NonRealtimeConsole] 턴 실행 실패", error)
      setStatusMessage(error?.message || "턴 실행 중 오류가 발생했습니다.")
    } finally {
      setPendingTurn(false)
    }
  }, [
    aiHistory,
    bundle,
    currentNode,
    operatorKey,
    promptPreview,
    turns.length,
  ])

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>비실시간 랭크 전투 콘솔</h1>
          <p className={styles.subtitle}>
            프롬프트를 확인하고 AI 응답에 따라 브릿지를 판정하는 수동 운영 도구입니다.
          </p>
        </div>
        <div className={styles.headerControls}>
          <label className={styles.controlField}>
            <span>게임 ID</span>
            <div className={styles.inlineControls}>
              <input
                value={gameIdInput}
                onChange={(event) => setGameIdInput(event.target.value)}
                placeholder="예: 12345"
              />
              <button type="button" onClick={loadGame} disabled={loading}>
                {loading ? "불러오는 중..." : "불러오기"}
              </button>
            </div>
          </label>
          <label className={styles.controlField}>
            <span>운영 키</span>
            <input
              type="password"
              value={operatorKey}
              onChange={(event) => setOperatorKey(event.target.value)}
              placeholder="매칭 직전 입력한 유저 API 키"
            />
          </label>
        </div>
      </header>

      {loadError && <p className={styles.error}>{loadError}</p>}
      {statusMessage && <p className={styles.status}>{statusMessage}</p>}

      {bundle ? (
        <div className={styles.layout}>
          <section className={styles.section}>
            <h2>현재 슬롯</h2>
            {currentNode ? (
              <div className={styles.slotCard}>
                <div className={styles.slotMeta}>
                  <span>{formatSlotLabel(currentNode)}</span>
                  <span className={styles.slotType}>{currentNode.slot_type || "AI"}</span>
                </div>
                <div className={styles.promptBlock}>
                  <h3>규칙 블록</h3>
                  <pre>{promptPreview?.rulesBlock || "(규칙 없음)"}</pre>
                </div>
                <div className={styles.promptBlock}>
                  <h3>프롬프트 본문</h3>
                  <pre>{promptPreview?.promptBody || "(본문 없음)"}</pre>
                </div>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleRunTurn}
                  disabled={pendingTurn || sessionEnded}
                >
                  {sessionEnded ? "종료됨" : pendingTurn ? "턴 실행 중..." : "다음 턴 실행"}
                </button>
              </div>
            ) : (
              <p className={styles.placeholder}>활성화된 슬롯이 없습니다.</p>
            )}
          </section>

          <section className={styles.section}>
            <h2>참가자 &amp; 능력 설정</h2>
            <div className={styles.participantList}>
              {participants.length === 0 ? (
                <p className={styles.placeholder}>참가자 정보가 없습니다.</p>
              ) : (
                participants.map((participant, index) => (
                  <div key={participant.id ?? index} className={styles.participantCard}>
                    <header>
                      <strong>{participant.hero?.name || `참가자 ${index + 1}`}</strong>
                      {participant.role && <span className={styles.participantRole}>{participant.role}</span>}
                    </header>
                    <label>
                      <span>이름</span>
                      <input
                        value={participant.hero?.name || ""}
                        onChange={(event) =>
                          handleParticipantChange(index, "name", event.target.value)
                        }
                      />
                    </label>
                    <div className={styles.abilityGrid}>
                      {[1, 2, 3, 4].map((no) => (
                        <label key={no}>
                          <span>{`능력 ${no}`}</span>
                          <input
                            value={participant.hero?.[`ability${no}`] || ""}
                            onChange={(event) =>
                              handleParticipantChange(
                                index,
                                `ability${no}`,
                                event.target.value,
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className={styles.section}>
            <h2>히스토리</h2>
            <div className={styles.historyColumns}>
              <div>
                <h3>AI에게 전달되는 히스토리</h3>
                <pre className={styles.historyBlock}>{historyText || "(히스토리 없음)"}</pre>
              </div>
              <div>
                <h3>운영자 뷰</h3>
                {turns.length === 0 ? (
                  <p className={styles.placeholder}>아직 기록된 턴이 없습니다.</p>
                ) : (
                  <ol className={styles.turnList}>
                    {turns.map((turn, index) => (
                      <li key={index}>
                        <header>
                          <span>{`${index + 1}턴 · ${formatSlotLabel(turn.node)}`}</span>
                          {turn.bridge?.action && (
                            <span className={styles.bridgeBadge}>{turn.bridge.action}</span>
                          )}
                        </header>
                        <div className={styles.turnPrompt}>
                          <strong>프롬프트</strong>
                          <pre>{turn.prompt?.promptBody || "(본문 없음)"}</pre>
                        </div>
                        <div className={styles.turnResponse}>
                          <strong>AI 응답</strong>
                          <pre>{turn.responseText || "(응답 없음)"}</pre>
                        </div>
                        <p className={styles.turnOutcome}>{formatOutcome(turn.outcome)}</p>
                        {turn.bridge?.nextSlotId && (
                          <p className={styles.turnBridgeInfo}>
                            다음 브릿지 → 슬롯 {String(turn.bridge.nextSlotId)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <p className={styles.placeholder}>게임을 불러오면 프롬프트와 히스토리를 확인할 수 있습니다.</p>
      )}
    </div>
  )
}
