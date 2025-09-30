'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import {
  buildSlotsFromParticipants,
  makeNodePrompt,
  parseOutcome,
} from '../../../lib/promptEngine'
import { createAiHistory } from '../../../lib/history'
import {
  clearActiveSessionRecord,
  markActiveSessionDefeated,
  storeActiveSessionRecord,
  updateActiveSessionRecord,
} from '../../../lib/rank/activeSessionStorage'
import { loadGameBundle } from './engine/loadGameBundle'
import { pickNextEdge } from './engine/graph'
import { buildSystemMessage, parseRules } from './engine/systemPrompt'

function normalizeHeroName(name) {
  if (!name) return ''
  return String(name).normalize('NFC').replace(/\s+/g, '').toLowerCase()
}

function resolveActorContext({ node, slots, participants }) {
  if (!node) {
    return { slotIndex: -1, heroSlot: null, participant: null }
  }

  const visibleSlots = Array.isArray(node?.options?.visible_slots)
    ? node.options.visible_slots
    : []

  const normalizedVisible = visibleSlots
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => value - 1)

  let slotIndex = -1
  const rawSlotNo = Number(node?.slot_no)
  if (Number.isFinite(rawSlotNo) && rawSlotNo > 0) {
    slotIndex = rawSlotNo - 1
  }
  if (slotIndex < 0 && normalizedVisible.length > 0) {
    slotIndex = normalizedVisible[0]
  }
  if (slotIndex < 0 && slots.length > 0) {
    slotIndex = 0
  }

  const heroSlot = slotIndex >= 0 && slotIndex < slots.length ? slots[slotIndex] : null
  const participant =
    slotIndex >= 0 && slotIndex < participants.length ? participants[slotIndex] : null

  return { slotIndex, heroSlot, participant }
}

function buildUserActionPersona({ heroSlot, participant }) {
  const name = heroSlot?.name || participant?.hero?.name || '플레이어 캐릭터'
  const role = participant?.role || heroSlot?.role || ''
  const description = heroSlot?.description || participant?.hero?.description || ''

  const abilities = []
  for (let index = 1; index <= 4; index += 1) {
    const ability = heroSlot?.[`ability${index}`] || participant?.hero?.[`ability${index}`]
    if (ability) abilities.push(ability)
  }

  const header = role ? `${name} (${role})` : name

  const systemLines = [
    `${header}의 1인칭 시점으로 대사와 행동을 작성하세요.`,
    description ? `캐릭터 설명: ${description}` : null,
    abilities.length ? `주요 능력: ${abilities.join(', ')}` : null,
    '상황을 충분히 묘사하고 캐릭터의 말투를 유지하세요.',
  ].filter(Boolean)

  const promptIntro = `상황을 참고해 ${header}가 어떤 행동을 취할지 서술하세요.`

  return {
    system: systemLines.join('\n'),
    prompt: promptIntro,
  }
}

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function parseHeroAudioProfile(raw) {
  if (!raw) return null

  let payload = raw
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw)
    } catch (error) {
      console.warn('Failed to parse hero audio profile:', error)
      return null
    }
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const profile = {}

  if (typeof payload.eqEnabled === 'boolean') {
    profile.eqEnabled = payload.eqEnabled
  }

  if (payload.equalizer && typeof payload.equalizer === 'object') {
    const eq = {}
    const low = toNumber(payload.equalizer.low)
    const mid = toNumber(payload.equalizer.mid)
    const high = toNumber(payload.equalizer.high)
    if (low != null) eq.low = low
    if (mid != null) eq.mid = mid
    if (high != null) eq.high = high
    if (Object.keys(eq).length) {
      profile.equalizer = eq
    }
  }

  if (typeof payload.reverbEnabled === 'boolean') {
    profile.reverbEnabled = payload.reverbEnabled
  }

  if (payload.reverbDetail && typeof payload.reverbDetail === 'object') {
    const mix = toNumber(payload.reverbDetail.mix)
    const decay = toNumber(payload.reverbDetail.decay)
    const detail = {}
    if (mix != null) detail.mix = mix
    if (decay != null) detail.decay = decay
    if (Object.keys(detail).length) {
      profile.reverbDetail = detail
    }
  }

  if (typeof payload.compressorEnabled === 'boolean') {
    profile.compressorEnabled = payload.compressorEnabled
  }

  if (payload.compressorDetail && typeof payload.compressorDetail === 'object') {
    const threshold = toNumber(payload.compressorDetail.threshold)
    const ratio = toNumber(payload.compressorDetail.ratio)
    const release = toNumber(payload.compressorDetail.release)
    const detail = {}
    if (threshold != null) detail.threshold = threshold
    if (ratio != null) detail.ratio = ratio
    if (release != null) detail.release = release
    if (Object.keys(detail).length) {
      profile.compressorDetail = detail
    }
  }

  return Object.keys(profile).length ? profile : null
}

function extractHeroAudioProfile(hero) {
  if (!hero) return null
  if (hero.audioProfile && typeof hero.audioProfile === 'object') {
    return hero.audioProfile
  }
  return (
    parseHeroAudioProfile(
      hero.audio_settings ?? hero.audio_profile ?? hero.audioProfile ?? hero.bgm_settings ?? null,
    ) || null
  )
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
  const [apiKey, setApiKeyState] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.sessionStorage.getItem('rank.start.apiKey') || ''
  })
  const [apiVersion, setApiVersionState] = useState(() => {
    if (typeof window === 'undefined') return 'gemini'
    return window.sessionStorage.getItem('rank.start.apiVersion') || 'gemini'
  })
  const [manualResponse, setManualResponse] = useState('')
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [winCount, setWinCount] = useState(0)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [viewerId, setViewerId] = useState(null)
  const [turnDeadline, setTurnDeadline] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [activeHeroAssets, setActiveHeroAssets] = useState({
    backgrounds: [],
    bgmUrl: null,
    audioProfile: null,
    primaryHero: null,
  })
  const [activeActorNames, setActiveActorNames] = useState([])
  const [turnTimerSeconds] = useState(() => {
    if (typeof window === 'undefined') return 60
    const stored = Number(window.sessionStorage.getItem('rank.start.turnTimer'))
    if (Number.isFinite(stored) && stored > 0) return stored
    return 60
  })

  const rememberActiveSession = useCallback(
    (payload = {}) => {
      if (!gameId || !game) return
      const actorNames = Array.isArray(payload.actorNames)
        ? payload.actorNames
        : activeActorNames
      storeActiveSessionRecord(gameId, {
        gameName: game.name || '',
        description: game.description || '',
        actorNames,
        ...payload,
      })
    },
    [gameId, game, activeActorNames],
  )

  const updateSessionRecord = useCallback(
    (payload = {}) => {
      if (!gameId) return
      const actorNames = Array.isArray(payload.actorNames)
        ? payload.actorNames
        : activeActorNames
      updateActiveSessionRecord(gameId, {
        actorNames,
        gameName: game?.name || '',
        description: game?.description || '',
        ...payload,
      })
    },
    [gameId, game, activeActorNames],
  )

  const clearSessionRecord = useCallback(() => {
    if (!gameId) return
    clearActiveSessionRecord(gameId)
  }, [gameId])

  const markSessionDefeated = useCallback(() => {
    if (!gameId) return
    markActiveSessionDefeated(gameId)
  }, [gameId])

  const setApiKey = useCallback((value) => {
    setApiKeyState(value)
    if (typeof window !== 'undefined') {
      if (value) {
        window.sessionStorage.setItem('rank.start.apiKey', value)
      } else {
        window.sessionStorage.removeItem('rank.start.apiKey')
      }
    }
  }, [])

  const setApiVersion = useCallback((value) => {
    setApiVersionState(value)
    if (typeof window !== 'undefined') {
      if (value) {
        window.sessionStorage.setItem('rank.start.apiVersion', value)
      } else {
        window.sessionStorage.removeItem('rank.start.apiVersion')
      }
    }
  }, [])

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

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (!alive) return
        if (error) {
          console.warn('뷰어 정보를 불러오지 못했습니다:', error)
          setViewerId(null)
          return
        }
        setViewerId(data?.user?.id || null)
      } catch (err) {
        if (!alive) return
        console.warn('뷰어 정보를 확인하는 중 오류 발생:', err)
        setViewerId(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!gameId || preflight) return
    updateSessionRecord({ turn, actorNames: activeActorNames })
  }, [gameId, preflight, turn, activeActorNames, updateSessionRecord])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!turnDeadline) {
      setTimeRemaining(null)
      return undefined
    }

    const tick = () => {
      const diff = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000))
      setTimeRemaining(diff)
    }

    tick()

    const timerId = window.setInterval(tick, 1000)
    return () => {
      window.clearInterval(timerId)
    }
  }, [turnDeadline])

  const systemPrompt = useMemo(() => buildSystemMessage(game || {}), [game])
  const parsedRules = useMemo(() => parseRules(game || {}), [game])
  const brawlEnabled = parsedRules?.brawl_rule === 'allow-brawl'
  const endConditionVariable = useMemo(() => {
    const raw = parsedRules?.end_condition_variable
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      return trimmed || null
    }
    return null
  }, [parsedRules])
  const slots = useMemo(() => buildSlotsFromParticipants(participants), [participants])
  const heroLookup = useMemo(() => {
    const map = new Map()
    participants.forEach((participant, index) => {
      const heroName = participant?.hero?.name
      if (!heroName) return
      const key = normalizeHeroName(heroName)
      if (!key) return
      const entry = {
        hero: participant.hero,
        participant,
        slotIndex: index,
      }
      if (!map.has(key)) {
        map.set(key, [entry])
      } else {
        map.get(key).push(entry)
      }
    })
    return map
  }, [participants])
  const resolveHeroAssets = useCallback(
    (names, fallbackContext) => {
      const trimmed = Array.isArray(names)
        ? names.map((name) => String(name || '').trim()).filter(Boolean)
        : []

      const matchedEntries = []
      const resolvedNames = []
      const seen = new Set()

      for (const raw of trimmed) {
        const key = normalizeHeroName(raw)
        if (!key || seen.has(key)) continue
        const candidates = heroLookup.get(key)
        if (candidates && candidates.length) {
          seen.add(key)
          resolvedNames.push(raw)
          matchedEntries.push(candidates[0])
        }
      }

      const fallbackHero = fallbackContext?.participant?.hero || null

      if (!matchedEntries.length) {
        if (fallbackHero) {
          matchedEntries.push({
            hero: fallbackHero,
            participant: fallbackContext?.participant || null,
            slotIndex: fallbackContext?.slotIndex ?? null,
          })
          if (fallbackHero.name) {
            resolvedNames.push(fallbackHero.name)
          }
        } else if (fallbackContext?.heroSlot?.name) {
          resolvedNames.push(fallbackContext.heroSlot.name)
        }
      }

      const backgrounds = matchedEntries
        .map((entry) => entry.hero?.background_url || entry.hero?.image_url || '')
        .filter(Boolean)
      if (!backgrounds.length && fallbackHero) {
        const fallbackBackground = fallbackHero.background_url || fallbackHero.image_url || ''
        if (fallbackBackground) {
          backgrounds.push(fallbackBackground)
        }
      }

      const bgmSource = matchedEntries.find((entry) => entry.hero?.bgm_url)
      const fallbackBgmHero = fallbackHero?.bgm_url ? fallbackHero : null
      const primaryHero =
        bgmSource?.hero || matchedEntries[0]?.hero || fallbackBgmHero || fallbackHero || null

      const audioProfileSource = matchedEntries.find((entry) => extractHeroAudioProfile(entry.hero))
      const resolvedAudioProfile =
        extractHeroAudioProfile(audioProfileSource?.hero) || extractHeroAudioProfile(fallbackHero)

      return {
        backgrounds,
        bgmUrl: bgmSource?.hero?.bgm_url || fallbackBgmHero?.bgm_url || null,
        audioProfile: resolvedAudioProfile,
        primaryHero,
        actorNames: resolvedNames,
      }
    },
    [heroLookup],
  )

  const updateHeroAssets = useCallback(
    (names, fallbackContext) => {
      const { backgrounds, bgmUrl, actorNames, audioProfile, primaryHero } =
        resolveHeroAssets(names, fallbackContext)
      setActiveHeroAssets({
        backgrounds,
        bgmUrl,
        audioProfile,
        primaryHero,
      })
      setActiveActorNames(actorNames)
    },
    [resolveHeroAssets],
  )
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
  const aiMemory = useMemo(
    () => history.getAiMemory({ last: 24 }),
    [history, historyVersion],
  )
  const playerHistories = useMemo(
    () =>
      participants.map((participant, index) => ({
        slotIndex: index,
        role: participant?.role || '',
        heroName:
          participant?.hero?.name ||
          participant?.hero_name ||
          participant?.heroName ||
          '',
        entries: history.getVisibleForSlot(index, { onlyPublic: true, last: 10 }),
      })),
    [participants, history, historyVersion],
  )
  const currentActorContext = useMemo(
    () => resolveActorContext({ node: currentNode, slots, participants }),
    [currentNode, slots, participants],
  )
  const slotType = currentNode?.slot_type || 'ai'
  const isUserActionSlot = slotType === 'user_action' || slotType === 'manual'
  const viewerOwnsSlot =
    isUserActionSlot && viewerId && currentActorContext?.participant?.owner_id === viewerId
  const canSubmitAction = !isUserActionSlot || viewerOwnsSlot
  const currentActorInfo = useMemo(
    () => ({
      slotIndex: currentActorContext?.slotIndex ?? null,
      role:
        currentActorContext?.participant?.role ||
        currentActorContext?.heroSlot?.role ||
        '',
      name:
        currentActorContext?.participant?.hero?.name ||
        currentActorContext?.heroSlot?.name ||
        '',
      isUserAction: isUserActionSlot,
    }),
    [currentActorContext, isUserActionSlot],
  )

  const handleStart = useCallback(() => {
    if (graph.nodes.length === 0) {
      setStatusMessage('시작할 프롬프트 세트를 찾을 수 없습니다.')
      return
    }

    const startNode = graph.nodes.find((node) => node.is_start) || graph.nodes[0]
    history.beginSession()
    setHistoryVersion((prev) => prev + 1)
    if (systemPrompt) {
      history.push({ role: 'system', content: systemPrompt, public: false })
    }

    visitedSlotIds.current = new Set()
    apiVersionLock.current = null
    setPreflight(false)
    setTurn(1)
    setLogs([])
    setWinCount(0)
    setActiveGlobal([])
    setActiveLocal([])
    setStatusMessage('게임이 시작되었습니다.')
    const startContext = resolveActorContext({ node: startNode, slots, participants })
    const startNames = startContext?.participant?.hero?.name
      ? [startContext.participant.hero.name]
      : startContext?.heroSlot?.name
      ? [startContext.heroSlot.name]
      : []
    updateHeroAssets(startNames, startContext)
    rememberActiveSession({
      turn: 1,
      actorNames: startNames,
      status: 'active',
      defeated: false,
    })
    setTurnDeadline(Date.now() + turnTimerSeconds * 1000)
    setTimeRemaining(turnTimerSeconds)
    setCurrentNodeId(startNode.id)
  }, [
    graph.nodes,
    history,
    systemPrompt,
    slots,
    participants,
    updateHeroAssets,
    rememberActiveSession,
    turnTimerSeconds,
  ])

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

      const actorContext = resolveActorContext({ node, slots, participants })
      const slotTypeValue = node.slot_type || 'ai'
      const isUserAction = slotTypeValue === 'user_action' || slotTypeValue === 'manual'
      const actingOwnerId = actorContext?.participant?.owner_id || null

      if (isUserAction && (!viewerId || actingOwnerId !== viewerId)) {
        setStatusMessage('현재 차례의 플레이어만 행동을 제출할 수 있습니다.')
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
        const variableRulesText = compiled.variableRules || ''
        if (compiled.pickedSlot != null) {
          visitedSlotIds.current.add(String(compiled.pickedSlot))
        }

        let responseText =
          typeof overrideResponse === 'string'
            ? overrideResponse.trim()
            : manualResponse.trim()

        let effectiveSystemPrompt = systemPrompt
        let effectivePrompt = promptText

        if (!game?.realtime_match && isUserAction) {
          const persona = buildUserActionPersona(actorContext)
          effectiveSystemPrompt = [systemPrompt, persona.system]
            .filter(Boolean)
            .join('\n\n')
          effectivePrompt = persona.prompt ? `${persona.prompt}\n\n${promptText}` : promptText
        }

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
                system: effectiveSystemPrompt,
                prompt: effectivePrompt,
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

        const slotIndex = actorContext.slotIndex
        const audiencePayload =
          slotIndex >= 0 ? { audience: 'slots', slotIndex } : { audience: 'all' }
        const historyRole = isUserAction ? 'user' : 'assistant'

        const fallbackActorNames = []
        if (actorContext?.participant?.hero?.name) {
          fallbackActorNames.push(actorContext.participant.hero.name)
        } else if (actorContext?.heroSlot?.name) {
          fallbackActorNames.push(actorContext.heroSlot.name)
        }

        const promptEntry = history.push({
          role: 'system',
          content: `[PROMPT]\n${effectivePrompt}`,
          public: false,
          includeInAi: true,
          ...audiencePayload,
          meta: { slotIndex, variableRules: variableRulesText },
        })
        const responseEntry = history.push({
          role: historyRole,
          content: responseText,
          public: true,
          includeInAi: true,
          ...audiencePayload,
          meta: { slotIndex },
        })
        setHistoryVersion((prev) => prev + 1)

        const outcome = parseOutcome(responseText)
        const resolvedActorNames =
          outcome.actors && outcome.actors.length ? outcome.actors : fallbackActorNames
        updateHeroAssets(resolvedActorNames, actorContext)
        if (promptEntry?.meta) {
          promptEntry.meta = { ...promptEntry.meta, actors: resolvedActorNames }
        }
        if (responseEntry?.meta) {
          responseEntry.meta = { ...responseEntry.meta, actors: resolvedActorNames }
        }
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
            actors: resolvedActorNames,
            variableRules: variableRulesText,
          },
        ])

        setManualResponse('')

        if (!chosenEdge) {
          setCurrentNodeId(null)
          setStatusMessage('더 이상 진행할 경로가 없어 세션을 종료합니다.')
          setTurnDeadline(null)
          setTimeRemaining(null)
          clearSessionRecord()
          return
        }

        const action = chosenEdge.data?.action || 'continue'
        const nextNodeId = chosenEdge.to != null ? String(chosenEdge.to) : null

        const outcomeVariables = outcome.variables || []
        const triggeredEnd = endConditionVariable
          ? outcomeVariables.includes(endConditionVariable)
          : false

        if (action === 'win') {
          const upcomingWin = winCount + 1
          if (brawlEnabled && !triggeredEnd) {
            setWinCount((prev) => prev + 1)
            setStatusMessage(`승리 ${upcomingWin}회 달성! 난입 허용 규칙으로 전투가 계속됩니다.`)
          } else {
            if (brawlEnabled) {
              setWinCount(() => upcomingWin)
            }
            setCurrentNodeId(null)
            const suffix = brawlEnabled
              ? ` 누적 승리 ${upcomingWin}회를 기록했습니다.`
              : ''
            setStatusMessage(`승리 조건이 충족되었습니다!${suffix}`)
            setTurnDeadline(null)
            setTimeRemaining(null)
            clearSessionRecord()
            return
          }
        } else if (action === 'lose') {
          setCurrentNodeId(null)
          setStatusMessage(
            brawlEnabled
              ? '패배로 해당 역할군이 전장에서 추방되었습니다.'
              : '패배 조건이 충족되었습니다.',
          )
          setTurnDeadline(null)
          setTimeRemaining(null)
          if (viewerId && actingOwnerId === viewerId) {
            markSessionDefeated()
          } else {
            clearSessionRecord()
          }
          return
        } else if (action === 'draw') {
          setCurrentNodeId(null)
          setStatusMessage('무승부로 종료되었습니다.')
          setTurnDeadline(null)
          setTimeRemaining(null)
          clearSessionRecord()
          return
        }

        if (!nextNodeId) {
          setCurrentNodeId(null)
          setStatusMessage('다음에 진행할 노드를 찾을 수 없습니다.')
          setTurnDeadline(null)
          setTimeRemaining(null)
          clearSessionRecord()
          return
        }

        setCurrentNodeId(nextNodeId)
        setTurn((prev) => prev + 1)
        setTurnDeadline(Date.now() + turnTimerSeconds * 1000)
        setTimeRemaining(turnTimerSeconds)
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
      participants,
      participantsStatus,
      game?.realtime_match,
      brawlEnabled,
      endConditionVariable,
      winCount,
      viewerId,
      updateHeroAssets,
      turnTimerSeconds,
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
    currentActor: currentActorInfo,
    canSubmitAction,
    activeBackdropUrls: activeHeroAssets.backgrounds,
    activeAudioProfile: activeHeroAssets.audioProfile,
    activeHero: activeHeroAssets.primaryHero,
    activeActorNames,
    activeBgmUrl: activeHeroAssets.bgmUrl,
  }
}
