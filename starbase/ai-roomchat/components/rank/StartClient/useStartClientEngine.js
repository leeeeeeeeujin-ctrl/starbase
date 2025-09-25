import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import {
  buildSlotsFromParticipants,
  makeNodePrompt,
  parseOutcome,
} from '../../../lib/promptEngine'
import { createAiHistory } from '../../../lib/history'
import { loadGameBundle } from './engine/loadGameBundle'
import { pickNextEdge } from './engine/graph'
import { buildSystemMessage } from './engine/systemPrompt'

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
        const bundle = await loadGameBundle(supabase, gameId)
        if (!alive) return
        setGame(bundle.game)
        setParticipants(bundle.participants)
        setGraph(bundle.graph)
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
