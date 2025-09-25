import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import {
  buildSlotsFromParticipants,
  buildSystemPromptFromChecklist,
  evaluateBridge,
  makeNodePrompt,
  parseOutcome,
} from '../../../lib/promptEngine'
import { createAiHistory } from '../../../lib/history'
import { sanitizeVariableRules } from '../../../lib/variableRules'

const COMPARATOR_LABEL = { gte: '이상', lte: '이하', eq: '정확히' }
const OUTCOME_LABEL = { win: '승리', lose: '패배', draw: '무승부' }
const STATUS_LABEL = { alive: '생존', dead: '탈락', won: '승리', lost: '패배' }

function formatAutoInstruction(rule) {
  const name = String(rule?.variable || '').trim()
  if (!name) return null

  const comparator = COMPARATOR_LABEL[rule?.comparator] || COMPARATOR_LABEL.gte
  const count = Number.isFinite(Number(rule?.count)) ? Number(rule.count) : 1
  const outcome = OUTCOME_LABEL[rule?.outcome] || OUTCOME_LABEL.win

  if (rule?.status === 'flag_on') {
    const flagName = String(rule?.flag || '').trim()
    if (!flagName) return null
    return `변수 ${flagName}가 활성화되면 응답 마지막 줄을 "${outcome}"로 선언하라.`
  }

  const subject = rule?.subject
  let subjectText = '지정한 역할'
  if (subject === 'same') subjectText = '같은 편 역할'
  else if (subject === 'other') subjectText = '상대편 역할'
  else if (subject === 'specific' && rule?.role) subjectText = `${rule.role} 역할`

  const statusText = STATUS_LABEL[rule?.status] || STATUS_LABEL.alive

  return `${subjectText} 중 ${statusText} 상태인 인원이 ${count}명${comparator}이면 응답 마지막 줄을 "${outcome}"로 선언하라.`
}

function convertScopeRules(rawRules) {
  const sanitized = sanitizeVariableRules(rawRules)
  const manual = []
  const active = []

  for (const rule of sanitized.manual) {
    const name = String(rule.variable || '').trim()
    if (!name) continue
    manual.push({ name, instruction: rule.condition || '' })
  }

  for (const rule of sanitized.auto) {
    const name = String(rule.variable || '').trim()
    if (!name) continue
    const instruction = formatAutoInstruction(rule)
    if (instruction) {
      manual.push({ name, instruction })
    }
  }

  for (const rule of sanitized.active) {
    const directive = String(rule.directive || '').trim()
    if (!directive) continue
    const entry = { directive }
    if (rule.condition) entry.condition = rule.condition
    if (rule.variable) entry.name = rule.variable
    active.push(entry)
  }

  return { manual, active }
}

function createNodeFromSlot(slot) {
  const globalRules = convertScopeRules(slot?.var_rules_global)
  const localRules = convertScopeRules(slot?.var_rules_local)

  return {
    id: String(slot.id),
    slot_no: slot.slot_no ?? null,
    template: slot.template || '',
    slot_type: slot.slot_type || 'ai',
    is_start: !!slot.is_start,
    options: {
      invisible: !!slot.invisible,
      visible_slots: Array.isArray(slot.visible_slots)
        ? slot.visible_slots.map((value) => Number(value))
        : [],
      manual_vars_global: globalRules.manual,
      manual_vars_local: localRules.manual,
      active_vars_global: globalRules.active,
      active_vars_local: localRules.active,
    },
  }
}

function pickNextEdge(edges, context) {
  if (!Array.isArray(edges) || edges.length === 0) {
    return null
  }

  const sorted = [...edges].sort(
    (a, b) => (b.data?.priority ?? 0) - (a.data?.priority ?? 0),
  )

  let fallback = null

  for (const edge of sorted) {
    if (!edge.to) continue
    if (edge.data?.fallback) {
      if (
        !fallback ||
        (edge.data?.priority ?? 0) > (fallback.data?.priority ?? 0)
      ) {
        fallback = edge
      }
      continue
    }

    if (evaluateBridge(edge.data, context)) {
      return edge
    }
  }

  return fallback
}

function normalizeParticipants(rows = []) {
  return rows.map((row) => {
    const hero = row?.heroes || {}
    return {
      id: row?.id,
      role: row?.role || '',
      status: row?.status || 'alive',
      score: Number(row?.score) || 0,
      rating: Number(row?.rating) || 0,
      hero_id: row?.hero_id || null,
      hero: {
        id: hero?.id || row?.hero_id || null,
        name: hero?.name || '이름 없는 영웅',
        description: hero?.description || '',
        image_url: hero?.image_url || '',
        ability1: hero?.ability1 || '',
        ability2: hero?.ability2 || '',
        ability3: hero?.ability3 || '',
        ability4: hero?.ability4 || '',
      },
    }
  })
}

function parseRules(game) {
  if (!game) return {}
  if (game.rules && typeof game.rules === 'object') {
    return game.rules
  }
  const source = game.rules_json ?? game.rules ?? null
  if (!source) return {}
  try {
    return JSON.parse(source)
  } catch (error) {
    return {}
  }
}

function buildSystemMessage(game) {
  const rules = parseRules(game)
  const checklist = buildSystemPromptFromChecklist(rules)
  const prefix = game?.rules_prefix ? String(game.rules_prefix) : ''
  return [prefix, checklist].filter(Boolean).join('\n')
}

export function useStartClientEngine(gameId) {
  const history = useMemo(() => createAiHistory(), [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [game, setGame] = useState(null)
  const [participants, setParticipants] = useState([])
  const [graph, setGraph] = useState({ nodes: [], edges: [] })
  const [preflight, setPreflight] = useState(true)
  const [turn, setTurn] = useState(1)
  const [currentNodeId, setCurrentNodeId] = useState(null)
  const [activeGlobal, setActiveGlobal] = useState([])
  const [activeLocal, setActiveLocal] = useState([])
  const [logs, setLogs] = useState([])
  const [statusMessage, setStatusMessage] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiVersion, setApiVersion] = useState('chat_completions')
  const [manualResponse, setManualResponse] = useState('')
  const [isAdvancing, setIsAdvancing] = useState(false)

  const visitedSlotIds = useRef(new Set())
  const apiVersionLock = useRef(null)

  useEffect(() => {
    if (!gameId) return

    let alive = true

    async function load() {
      setLoading(true)
      setError('')
      try {
        const { data: gameRow, error: gameError } = await supabase
          .from('rank_games')
          .select('*')
          .eq('id', gameId)
          .single()

        if (!alive) return
        if (gameError) throw gameError
        setGame(gameRow)

        const { data: participantRows, error: participantError } = await supabase
          .from('rank_participants')
          .select(
            'id, role, status, hero_id, score, rating, heroes:hero_id(id,name,description,image_url,ability1,ability2,ability3,ability4)',
          )
          .eq('game_id', gameId)

        if (!alive) return
        if (participantError) throw participantError
        setParticipants(normalizeParticipants(participantRows || []))

        if (gameRow?.prompt_set_id) {
          const [{ data: slotRows, error: slotError }, { data: bridgeRows, error: bridgeError }] = await Promise.all([
            supabase
              .from('prompt_slots')
              .select('*')
              .eq('set_id', gameRow.prompt_set_id)
              .order('slot_no'),
            supabase
              .from('prompt_bridges')
              .select('*')
              .eq('from_set', gameRow.prompt_set_id),
          ])

          if (!alive) return
          if (slotError) throw slotError
          if (bridgeError) throw bridgeError

          const nodes = (slotRows || []).map((slot) => createNodeFromSlot(slot))
          const edges = (bridgeRows || [])
            .map((bridge) => ({
              id: String(bridge.id),
              from: bridge.from_slot_id ? String(bridge.from_slot_id) : '',
              to: bridge.to_slot_id ? String(bridge.to_slot_id) : '',
              data: {
                trigger_words: bridge.trigger_words || [],
                conditions: bridge.conditions || [],
                priority: bridge.priority ?? 0,
                probability: bridge.probability ?? 1,
                fallback: !!bridge.fallback,
                action: bridge.action || 'continue',
              },
            }))
            .filter((edge) => edge.from && edge.to)

          setGraph({ nodes, edges })
        } else {
          setGraph({ nodes: [], edges: [] })
        }
      } catch (err) {
        if (!alive) return
        console.error(err)
        setError(err?.message || '게임 데이터를 불러오지 못했습니다.')
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()

    return () => {
      alive = false
    }
  }, [gameId])

  const systemPrompt = useMemo(() => buildSystemMessage(game || {}), [game])
  const slots = useMemo(() => buildSlotsFromParticipants(participants), [participants])
  const participantsStatus = useMemo(
    () =>
      participants.map((participant) => ({
        role: participant.role,
        status: participant.status,
      })),
    [participants],
  )
  const currentNode = useMemo(
    () => graph.nodes.find((node) => node.id === currentNodeId) || null,
    [graph.nodes, currentNodeId],
  )

  const handleStart = useCallback(() => {
    if (graph.nodes.length === 0) {
      setStatusMessage('시작할 프롬프트 세트를 찾을 수 없습니다.')
      return
    }

    const startNode = graph.nodes.find((node) => node.is_start) || graph.nodes[0]
    history.beginSession()
    if (systemPrompt) {
      history.push({ role: 'system', content: systemPrompt, public: false })
    }

    visitedSlotIds.current = new Set()
    apiVersionLock.current = null
    setPreflight(false)
    setTurn(1)
    setLogs([])
    setActiveGlobal([])
    setActiveLocal([])
    setStatusMessage('게임이 시작되었습니다.')
    setCurrentNodeId(startNode.id)
  }, [graph.nodes, history, systemPrompt])

  const advanceTurn = useCallback(
    async (overrideResponse = null) => {
      if (preflight) {
        setStatusMessage('먼저 "게임 시작"을 눌러 주세요.')
        return
      }
      if (!currentNodeId) {
        setStatusMessage('진행 가능한 노드가 없습니다.')
        return
      }

      const node = graph.nodes.find((entry) => entry.id === currentNodeId)
      if (!node) {
        setStatusMessage('현재 노드 정보를 찾을 수 없습니다.')
        return
      }

      setIsAdvancing(true)
      setStatusMessage('')

      try {
        const compiled = makeNodePrompt({
          node,
          slots,
          historyText: history.joinedText({ onlyPublic: false, last: 12 }),
          activeGlobalNames: activeGlobal,
          activeLocalNames: activeLocal,
          currentSlot: null,
        })

        const promptText = compiled.text
        if (compiled.pickedSlot != null) {
          visitedSlotIds.current.add(String(compiled.pickedSlot))
        }

        let responseText =
          typeof overrideResponse === 'string'
            ? overrideResponse.trim()
            : manualResponse.trim()

        if (!responseText) {
          if (apiKey) {
            if (game?.realtime_match) {
              if (
                apiVersionLock.current &&
                apiVersionLock.current !== apiVersion
              ) {
                throw new Error(
                  '실시간 매칭에서는 처음 선택한 API 버전을 변경할 수 없습니다.',
                )
              }
            }

            const res = await fetch('/api/rank/run-turn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                apiKey,
                system: systemPrompt,
                prompt: promptText,
                apiVersion,
              }),
            })

            if (!res.ok) {
              const payload = await res.json().catch(() => ({}))
              throw new Error(payload?.error || 'AI 호출에 실패했습니다.')
            }

            const payload = await res.json()
            if (payload?.error) {
              throw new Error(payload.error)
            }

            responseText =
              (typeof payload?.text === 'string' && payload.text.trim()) ||
              payload?.choices?.[0]?.message?.content ||
              payload?.content ||
              ''

            if (game?.realtime_match && !apiVersionLock.current) {
              apiVersionLock.current = apiVersion
            }
          }
        }

        if (!responseText) {
          responseText = ['(샘플 응답)', '', '', '', '', '무승부'].join('\n')
        }

        history.push({
          role: 'system',
          content: `[PROMPT]\n${promptText}`,
          public: false,
        })
        history.push({ role: 'assistant', content: responseText, public: true })

        const outcome = parseOutcome(responseText)
        const nextActiveGlobal = Array.from(
          new Set([...activeGlobal, ...(outcome.variables || [])]),
        )

        setActiveLocal(outcome.variables || [])
        setActiveGlobal(nextActiveGlobal)

        const context = {
          turn,
          historyUserText: history.joinedText({ onlyPublic: true, last: 5 }),
          historyAiText: history.joinedText({ onlyPublic: false, last: 5 }),
          visitedSlotIds: visitedSlotIds.current,
          participantsStatus,
          activeGlobalNames: nextActiveGlobal,
          activeLocalNames: outcome.variables || [],
        }

        const outgoing = graph.edges.filter(
          (edge) => edge.from === String(node.id) || edge.from === node.id,
        )
        const chosenEdge = pickNextEdge(outgoing, context)

        setLogs((prev) => [
          ...prev,
          {
            turn,
            nodeId: node.id,
            prompt: promptText,
            response: responseText,
            outcome: outcome.lastLine || '',
            variables: outcome.variables || [],
            next: chosenEdge?.to || null,
            action: chosenEdge?.data?.action || 'continue',
          },
        ])

        setManualResponse('')

        if (!chosenEdge) {
          setCurrentNodeId(null)
          setStatusMessage('더 이상 진행할 경로가 없어 세션을 종료합니다.')
          return
        }

        const action = chosenEdge.data?.action || 'continue'
        if (action === 'win') {
          setCurrentNodeId(null)
          setStatusMessage('승리 조건이 충족되었습니다!')
          return
        }
        if (action === 'lose') {
          setCurrentNodeId(null)
          setStatusMessage('패배 조건이 충족되었습니다.')
          return
        }
        if (action === 'draw') {
          setCurrentNodeId(null)
          setStatusMessage('무승부로 종료되었습니다.')
          return
        }

        setCurrentNodeId(String(chosenEdge.to))
        setTurn((prev) => prev + 1)
      } catch (err) {
        console.error(err)
        setStatusMessage(err?.message || '턴 진행 중 오류가 발생했습니다.')
      } finally {
        setIsAdvancing(false)
      }
    },
    [
      preflight,
      currentNodeId,
      graph.nodes,
      graph.edges,
      slots,
      history,
      activeGlobal,
      activeLocal,
      manualResponse,
      apiKey,
      apiVersion,
      systemPrompt,
      turn,
      participantsStatus,
      game?.realtime_match,
    ],
  )

  const advanceWithManual = useCallback(() => {
    if (!manualResponse.trim()) {
      alert('수동 응답을 입력하세요.')
      return
    }
    advanceTurn(manualResponse.trim())
  }, [advanceTurn, manualResponse])

  const advanceWithAi = useCallback(() => {
    advanceTurn(null)
  }, [advanceTurn])

  return {
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
  }
}

//
