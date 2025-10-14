'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import {
  MESSAGE_LIMIT,
  fetchRecentMessages,
  getCurrentUser,
  insertMessage,
  subscribeToMessages,
} from '../../../lib/chat/messages'
import {
  hydrateIncomingMessage,
  hydrateMessageList,
} from '../../../lib/chat/hydrateMessages'
import { createDraftyFromText, inspectDrafty } from '../../../lib/chat/drafty'
import { resolveViewerProfile } from '../../../lib/heroes/resolveViewerProfile'

const BLOCKED_STORAGE_KEY = 'starbase_blocked_heroes'
const CHAT_CACHE_KEY = 'starbase_shared_chat_cache_v1'

const SharedChatDockContext = createContext(null)

const DEFAULT_VIEWER = {
  name: '익명',
  avatar_url: null,
  hero_id: null,
  owner_id: null,
  user_id: null,
}

function deriveViewerFromHint(hint) {
  if (!hint) return null
  const heroId = hint.heroId || hint.hero_id || hint.id || null
  const ownerId = hint.ownerId || hint.owner_id || hint.userId || hint.user_id || null
  const userId = hint.userId || hint.user_id || ownerId || null
  const avatar = hint.avatarUrl ?? hint.avatar_url ?? hint.image_url ?? null
  const name = hint.heroName || hint.name || hint.displayName || null

  if (!heroId && !ownerId && !userId && !avatar && !name) {
    return null
  }

  return {
    name: name || DEFAULT_VIEWER.name,
    avatar_url: avatar ?? DEFAULT_VIEWER.avatar_url,
    hero_id: heroId || DEFAULT_VIEWER.hero_id,
    owner_id: ownerId || userId || DEFAULT_VIEWER.owner_id,
    user_id: userId || ownerId || DEFAULT_VIEWER.user_id,
  }
}

function mergeViewerState(current, hint) {
  if (!hint) return current

  const merged = { ...current }
  const heroId = hint.hero_id

  if (heroId && heroId !== merged.hero_id) {
    merged.hero_id = heroId
  }

  if (hint.owner_id && hint.owner_id !== merged.owner_id) {
    merged.owner_id = hint.owner_id
  }

  if (hint.user_id && hint.user_id !== merged.user_id) {
    merged.user_id = hint.user_id
  }

  if (hint.avatar_url && hint.avatar_url !== merged.avatar_url) {
    merged.avatar_url = hint.avatar_url
  }

  if (hint.name && (merged.name === DEFAULT_VIEWER.name || merged.name !== hint.name)) {
    merged.name = hint.name
  }

  return merged
}

function normalizeBlockedHeroes(list) {
  if (!Array.isArray(list)) return []
  return Array.from(new Set(list.filter(Boolean)))
}

function areListsEqual(a, b) {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false
  }
  return true
}

function loadBlockedHeroes() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(BLOCKED_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return []
  }
}

function persistBlockedHeroes(list) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(BLOCKED_STORAGE_KEY, JSON.stringify(list))
  } catch (error) {
    // ignore storage errors silently
  }
}

function loadMessageCache() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CHAT_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return []
  }
}

function persistMessageCache(list) {
  if (typeof window === 'undefined') return
  try {
    const payload = Array.isArray(list) ? list.slice(-MESSAGE_LIMIT) : []
    window.localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(payload))
  } catch (error) {
    // ignore storage issues silently
  }
}

function useSharedChatDockInternal({
  heroId,
  extraWhisperTargets = [],
  blockedHeroes: externalBlockedHeroes,
  viewerHero = null,
  sessionId = null,
  matchInstanceId = null,
  gameId = null,
  roomId = null,
  roster = [],
  viewerRole: viewerRoleHint = null,
  allowMainInput = true,
  onSend,
  onNotify,
  pollingEnabled = false,
}) {
  const listRef = useRef(null)
  const activeThreadRef = useRef('global')
  const viewerHeroRef = useRef(null)
  const messageIdSetRef = useRef(new Set())
  const [chatContext, setChatContext] = useState({
    sessionId: sessionId || null,
    matchInstanceId: matchInstanceId || null,
    gameId: gameId || null,
    roomId: roomId || null,
    viewerRole: viewerRoleHint || null,
  })
  const chatContextRef = useRef(chatContext)

  useEffect(() => {
    chatContextRef.current = chatContext
  }, [chatContext])

  useEffect(() => {
    setChatContext((prev) => ({
      sessionId: sessionId ?? prev.sessionId,
      matchInstanceId: matchInstanceId ?? prev.matchInstanceId,
      gameId: gameId ?? prev.gameId,
      roomId: roomId ?? prev.roomId,
      viewerRole: viewerRoleHint || prev.viewerRole || null,
    }))
  }, [sessionId, matchInstanceId, gameId, roomId, viewerRoleHint])

  const hintProfile = useMemo(() => deriveViewerFromHint(viewerHero), [viewerHero])
  const initialViewerState = useMemo(
    () => mergeViewerState(DEFAULT_VIEWER, hintProfile),
    [hintProfile],
  )

  const heroCacheRef = useRef(new Map())
  const ownerCacheRef = useRef(new Map())
  const [messages, setMessages] = useState([])
  const [me, setMe] = useState(initialViewerState)
  const [input, setInput] = useState('')
  const [scope, setScopeInternal] = useState('global')
  const [whisperTarget, setWhisperTargetInternal] = useState(null)
  const [blockedHeroes, setBlockedHeroes] = useState(() => {
    if (Array.isArray(externalBlockedHeroes)) {
      return normalizeBlockedHeroes(externalBlockedHeroes)
    }
    return loadBlockedHeroes()
  })
  const [activeThread, setActiveThreadState] = useState('global')
  const [unreadThreads, setUnreadThreads] = useState({})

  const viewerProfileRef = useRef(initialViewerState)

  const blockedHeroSet = useMemo(() => new Set(blockedHeroes), [blockedHeroes])

  const viewerRoleValue = chatContext.viewerRole || viewerRoleHint || null
  const viewerRoleLower = useMemo(
    () => (viewerRoleValue ? viewerRoleValue.toLowerCase() : null),
    [viewerRoleValue],
  )
  const viewerRoleLabel = useMemo(() => viewerRoleValue || null, [viewerRoleValue])

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
  }, [])

  const limitMessages = useCallback((nextMessages) => {
    const limited = Array.isArray(nextMessages)
      ? nextMessages.slice(Math.max(0, nextMessages.length - MESSAGE_LIMIT))
      : []
    const idSet = new Set()
    for (const message of limited) {
      if (message?.id !== undefined && message?.id !== null) {
        idSet.add(message.id)
      }
    }
    messageIdSetRef.current = idSet
    persistMessageCache(limited)
    return limited
  }, [])

  const replaceMessages = useCallback(
    (nextMessages) => {
      const limited = limitMessages(nextMessages)
      setMessages(limited)
    },
    [limitMessages],
  )

  useEffect(() => {
    const cached = loadMessageCache()
    if (cached.length) {
      replaceMessages(cached)
    }
  }, [replaceMessages])

  useEffect(() => {
    if (!Array.isArray(externalBlockedHeroes)) return
    const normalized = normalizeBlockedHeroes(externalBlockedHeroes)
    setBlockedHeroes((prev) => {
      if (areListsEqual(prev, normalized)) {
        return prev
      }
      return normalized
    })
  }, [externalBlockedHeroes])

  const viewerHeroId = heroId || me.hero_id || null
  useEffect(() => {
    viewerHeroRef.current = viewerHeroId
  }, [viewerHeroId])

  useEffect(() => {
    if (chatContextRef.current.viewerRole) return
    if (!Array.isArray(roster) || roster.length === 0) return

    const currentHeroId = viewerHeroRef.current || viewerHero?.hero_id || heroId || null
    const ownerId = me?.owner_id || me?.user_id || null

    const match = roster.find((slot) => {
      if (!slot) return false
      if (slot.heroId && currentHeroId && slot.heroId === currentHeroId) {
        return true
      }
      if (slot.ownerId && ownerId && slot.ownerId === ownerId) {
        return true
      }
      return false
    })

    if (match?.role) {
      setChatContext((prev) => {
        if (prev.viewerRole === match.role) {
          return prev
        }
        return { ...prev, viewerRole: match.role }
      })
    }
  }, [heroId, me, roster, viewerHero])

  useEffect(() => {
    viewerProfileRef.current = me
  }, [me])

  useEffect(() => {
    if (!hintProfile) return
    setMe((prev) => mergeViewerState(prev, hintProfile))
  }, [hintProfile])

  const buildHydrationHints = useCallback(() => {
    const hints = []

    const currentViewer = viewerProfileRef.current
    if (currentViewer?.hero_id) {
      hints.push({
        heroId: currentViewer.hero_id,
        heroName: currentViewer.name,
        avatarUrl: currentViewer.avatar_url,
        ownerId: currentViewer.owner_id,
        userId: currentViewer.user_id,
      })
    }

    if (hintProfile?.hero_id) {
      hints.push({
        heroId: hintProfile.hero_id,
        heroName: hintProfile.name,
        avatarUrl: hintProfile.avatar_url,
        ownerId: hintProfile.owner_id,
        userId: hintProfile.user_id,
      })
    }

    if (viewerHero) {
      hints.push(viewerHero)
    }

    if (Array.isArray(extraWhisperTargets)) {
      for (const target of extraWhisperTargets) {
        hints.push(target)
      }
    }

    return hints
  }, [extraWhisperTargets, hintProfile, viewerHero])

  const hydrateBatch = useCallback(
    async (rawMessages) => {
      const { messages: hydrated } = await hydrateMessageList(rawMessages, {
        viewer: viewerProfileRef.current,
        viewerHint: hintProfile,
        hints: buildHydrationHints(),
        heroCache: heroCacheRef.current,
        ownerCache: ownerCacheRef.current,
      })
      return hydrated
    },
    [buildHydrationHints, hintProfile],
  )

  const fetchAndHydrateMessages = useCallback(async () => {
    const contextSnapshot = chatContextRef.current || {}
    const result = await fetchRecentMessages({
      limit: MESSAGE_LIMIT,
      sessionId: contextSnapshot.sessionId || sessionId || null,
      matchInstanceId: contextSnapshot.matchInstanceId || matchInstanceId || null,
    })

    setChatContext((prev) => {
      const next = {
        sessionId: result.sessionId ?? prev.sessionId,
        matchInstanceId: result.matchInstanceId ?? prev.matchInstanceId,
        gameId: result.gameId ?? prev.gameId,
        roomId: prev.roomId,
        viewerRole: prev.viewerRole || result.viewerRole || null,
      }
      return next
    })

    return hydrateBatch(result.messages)
  }, [hydrateBatch, sessionId, matchInstanceId])

  const hydrateSingle = useCallback(
    async (rawMessage) => {
      const { message: hydrated } = await hydrateIncomingMessage(rawMessage, {
        viewer: viewerProfileRef.current,
        viewerHint: hintProfile,
        hints: buildHydrationHints(),
        heroCache: heroCacheRef.current,
        ownerCache: ownerCacheRef.current,
      })
      return hydrated
    },
    [buildHydrationHints, hintProfile],
  )

  const heroDirectory = useMemo(() => {
    const directory = new Map()
    for (const message of messages) {
      if (message?.hero_id && message?.username) {
        directory.set(message.hero_id, {
          username: message.username,
          avatarUrl: message.avatar_url || null,
          ownerId: message.owner_id || message.user_id || null,
        })
      }
    }
    if (viewerHeroId && me?.name) {
      if (!directory.has(viewerHeroId)) {
        directory.set(viewerHeroId, {
          username: me.name,
          avatarUrl: me.avatar_url || null,
          ownerId: me.owner_id || me.user_id || null,
        })
      }
    }
    return directory
  }, [messages, viewerHeroId, me.avatar_url, me.name, me.owner_id, me.user_id])

  const blockedHeroEntries = useMemo(() => {
    if (!blockedHeroes?.length) return []
    return blockedHeroes
      .filter(Boolean)
      .map((heroId) => {
        const meta = heroDirectory.get(heroId) || {}
        return {
          heroId,
          heroName: meta.username || '이름 미확인',
          avatarUrl: meta.avatarUrl || null,
        }
      })
  }, [blockedHeroes, heroDirectory])

  const whisperThreads = useMemo(() => {
    if (!viewerHeroId) return []
    const map = new Map()
    for (const message of messages) {
      const messageScope = message?.scope || message?.thread_scope || 'global'
      if (messageScope !== 'whisper') continue
      if (message.hero_id !== viewerHeroId && message.target_hero_id !== viewerHeroId) continue
      const counterpart = message.hero_id === viewerHeroId ? message.target_hero_id : message.hero_id
      if (!counterpart) continue
      const meta = heroDirectory.get(counterpart)
      const threadId = `whisper:${counterpart}`
      const existing = map.get(threadId) || {
        heroId: counterpart,
        threadId,
        heroName: meta?.username || '알 수 없는 영웅',
        ownerId: meta?.ownerId || null,
        lastMessageAt: message.created_at,
      }
      if (existing.lastMessageAt < message.created_at) {
        existing.lastMessageAt = message.created_at
      }
      if (meta?.username) {
        existing.heroName = meta.username
      }
      if (meta?.ownerId) {
        existing.ownerId = meta.ownerId
      }
      map.set(threadId, existing)
    }
    const list = Array.from(map.values())
    list.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    return list
  }, [heroDirectory, messages, viewerHeroId])

  const availableTargets = useMemo(() => {
    const seen = new Map()
    const list = []

    heroDirectory.forEach((meta, id) => {
      if (!id || id === viewerHeroId) return
      const username = meta?.username || '알 수 없는 영웅'
      list.push({ heroId: id, username })
      seen.set(id, true)
    })

    for (const target of extraWhisperTargets || []) {
      if (!target?.heroId) continue
      if (target.heroId === viewerHeroId) continue
      if (seen.has(target.heroId)) continue
      list.push({ heroId: target.heroId, username: target.username || '알 수 없는 영웅' })
      seen.set(target.heroId, true)
    }

    list.sort((a, b) => a.username.localeCompare(b.username, 'ko'))
    return list
  }, [extraWhisperTargets, heroDirectory, viewerHeroId])

  const scopeOptions = useMemo(() => {
    const options = [{ value: 'global', label: '전체 공개', disabled: false }]
    if (chatContext.matchInstanceId || chatContext.sessionId) {
      options.push({ value: 'main', label: '메인 게임', disabled: !allowMainInput })
    }
    if (viewerRoleLabel) {
      options.push({ value: 'role', label: `역할 (${viewerRoleLabel})`, disabled: false })
    }
    options.push({ value: 'whisper', label: '귓속말', disabled: availableTargets.length === 0 })
    return options
  }, [allowMainInput, availableTargets.length, chatContext.matchInstanceId, chatContext.sessionId, viewerRoleLabel])

  const primaryThreads = useMemo(() => {
    const threads = [{ id: 'global', label: '전체', closable: false }]
    if (chatContext.matchInstanceId || chatContext.sessionId) {
      threads.push({ id: 'main', label: '메인', closable: false })
    }
    if (viewerRoleLabel) {
      threads.push({ id: 'role', label: `역할 (${viewerRoleLabel})`, closable: false })
    }
    return threads
  }, [chatContext.matchInstanceId, chatContext.sessionId, viewerRoleLabel])

  const visibleMessages = useMemo(() => {
    return messages.filter((message) => {
      const messageScope = (message?.scope || message?.thread_scope || 'global').toLowerCase()
      if (message?.hero_id && blockedHeroSet.has(message.hero_id) && message.hero_id !== viewerHeroId) {
        return false
      }
      if (messageScope === 'blocked') {
        return false
      }
      if (activeThread === 'global') {
        return messageScope === 'global' || messageScope === 'system'
      }
      if (activeThread === 'main') {
        return messageScope === 'main' || messageScope === 'system'
      }
      if (activeThread === 'role') {
        if (messageScope !== 'role') return false
        if (!viewerRoleLower) return true
        const targetRole = (message?.target_role || message?.role || '').toLowerCase()
        return !targetRole || targetRole === viewerRoleLower
      }
      if (activeThread.startsWith('whisper:')) {
        if (messageScope !== 'whisper') return false
        if (!viewerHeroId) return false
        if (message.hero_id !== viewerHeroId && message.target_hero_id !== viewerHeroId) {
          return false
        }
        const counterpart = message.hero_id === viewerHeroId ? message.target_hero_id : message.hero_id
        const threadTarget = activeThread.split(':')[1] || ''
        return counterpart && threadTarget && String(counterpart) === threadTarget
      }
      return false
    })
  }, [activeThread, blockedHeroSet, messages, viewerHeroId, viewerRoleLower])

  const canSend = useMemo(() => {
    if (!input.trim()) return false
    if (scope === 'whisper' && !whisperTarget) return false
    if (scope === 'main' && !allowMainInput) return false
    if (scope === 'role' && !viewerRoleLower) return false
    return true
  }, [allowMainInput, input, scope, viewerRoleLower, whisperTarget])

  useEffect(() => {
    persistBlockedHeroes(blockedHeroes)
  }, [blockedHeroes])

  const setActiveThread = useCallback(
    (thread) => {
      const normalized = thread || 'global'
      setActiveThreadState(normalized)
      if (normalized.startsWith('whisper:')) {
        const target = normalized.split(':')[1] || null
        setScopeInternal('whisper')
        setWhisperTargetInternal(target)
      } else if (normalized === 'main') {
        setScopeInternal('main')
        setWhisperTargetInternal(null)
      } else if (normalized === 'role') {
        setScopeInternal('role')
        setWhisperTargetInternal(null)
      } else {
        setScopeInternal('global')
        setWhisperTargetInternal(null)
      }
    },
    [setActiveThreadState, setScopeInternal, setWhisperTargetInternal],
  )

  useEffect(() => {
    setActiveThread('global')
    setUnreadThreads({})
  }, [setActiveThread, viewerHeroId])

  useEffect(() => {
    activeThreadRef.current = activeThread
    if (activeThread === 'global') return
    setUnreadThreads((prev) => {
      if (!prev[activeThread]) return prev
      const next = { ...prev }
      delete next[activeThread]
      return next
    })
  }, [activeThread])

  useEffect(() => {
    if (!pollingEnabled) return undefined

    let cancelled = false
    let running = false

    const tick = async () => {
      if (cancelled || running) return
      running = true
      try {
        const hydrated = await fetchAndHydrateMessages()
        if (!cancelled) {
          replaceMessages(hydrated)
        }
      } catch (error) {
        console.error('채팅을 새로고침하지 못했습니다.', error)
      } finally {
        running = false
      }
    }

    tick()
    const intervalId = setInterval(tick, 1000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [pollingEnabled, fetchAndHydrateMessages, replaceMessages])

  useEffect(() => {
    let alive = true

    const bootstrap = async () => {
      try {
        const user = await getCurrentUser()
        if (!alive || !user) return

        const profile = await resolveViewerProfile(user, heroId, {
          fallbackHero: viewerHero,
        })
        if (!alive) return
        const mergedProfile = mergeViewerState(profile, hintProfile)
        viewerProfileRef.current = mergedProfile
        setMe(mergedProfile)

        const hydrated = await fetchAndHydrateMessages()
        if (!alive) return
        replaceMessages(hydrated)
        scrollToBottom()
      } catch (error) {
        console.error('채팅 데이터를 불러오지 못했습니다.', error)
      }
    }

    bootstrap()

    const handleInsert = async (incoming) => {
      try {
        const hydrated = await hydrateSingle(incoming)
        if (!alive || !hydrated) return

        setMessages((prev) => {
          if (hydrated?.id && messageIdSetRef.current.has(hydrated.id)) {
            return prev
          }
          const next = [...prev, hydrated]
          const limited =
            next.length > MESSAGE_LIMIT ? next.slice(next.length - MESSAGE_LIMIT) : next
          const idSet = new Set()
          for (const message of limited) {
            if (message?.id !== undefined && message?.id !== null) {
              idSet.add(message.id)
            }
          }
          messageIdSetRef.current = idSet
          persistMessageCache(limited)
          return limited
        })

        const viewerId = viewerHeroRef.current
        const scope = hydrated?.scope || hydrated?.thread_scope || 'global'
        let threadKey = 'global'

        if (scope === 'whisper' && viewerId) {
          const isParticipant =
            hydrated.hero_id === viewerId || hydrated.target_hero_id === viewerId
          const isSelf = hydrated.hero_id === viewerId
          const counterpart =
            hydrated.hero_id === viewerId ? hydrated.target_hero_id : hydrated.hero_id
          threadKey = counterpart ? `whisper:${counterpart}` : 'global'
          if (isParticipant && !isSelf && threadKey && threadKey !== activeThreadRef.current) {
            setUnreadThreads((prev) => ({
              ...prev,
              [threadKey]: (prev[threadKey] || 0) + 1,
            }))
          }
        } else if (scope === 'main') {
          threadKey = 'main'
          if (threadKey !== activeThreadRef.current) {
            setUnreadThreads((prev) => ({
              ...prev,
              [threadKey]: (prev[threadKey] || 0) + 1,
            }))
          }
        } else if (scope === 'role') {
          threadKey = 'role'
          if (threadKey !== activeThreadRef.current) {
            setUnreadThreads((prev) => ({
              ...prev,
              [threadKey]: (prev[threadKey] || 0) + 1,
            }))
          }
        }

        scrollToBottom()

        if (typeof onNotify === 'function') {
          onNotify({ message: hydrated, scope, threadId: threadKey })
        }
      } catch (error) {
        console.error('실시간 메시지를 처리하지 못했습니다.', error)
      }
    }

    const contextSnapshot = chatContextRef.current || {}
    const activeSessionId = contextSnapshot.sessionId || sessionId || null
    const activeMatchId = contextSnapshot.matchInstanceId || matchInstanceId || null
    const activeGameId = contextSnapshot.gameId || gameId || null
    const activeRoomId = contextSnapshot.roomId || roomId || null
    const viewerProfile = viewerProfileRef.current || me || {}
    const realtimeHeroId =
      viewerHeroRef.current || viewerProfile.hero_id || viewerHero?.hero_id || heroId || null
    const realtimeOwnerId =
      viewerProfile.owner_id || viewerProfile.user_id || viewerHero?.owner_id || null

    const unsubscribe = subscribeToMessages({
      channelName: 'messages-shared-dock',
      sessionId: activeSessionId,
      matchInstanceId: activeMatchId,
      gameId: activeGameId,
      roomId: activeRoomId,
      heroId: realtimeHeroId,
      ownerId: realtimeOwnerId,
      userId: viewerProfile.user_id || null,
      onInsert: (message) => {
        handleInsert(message)
      },
    })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [
    fetchAndHydrateMessages,
    heroId,
    hydrateSingle,
    viewerHero,
    hintProfile,
    replaceMessages,
    scrollToBottom,
    onNotify,
    sessionId,
    matchInstanceId,
    chatContext.matchInstanceId,
    chatContext.sessionId,
    chatContext.gameId,
    chatContext.roomId,
    gameId,
    roomId,
    me?.hero_id,
    me?.owner_id,
    me?.user_id,
  ])

  const handleSetScope = useCallback(
    (nextScope) => {
      const normalized = nextScope || 'global'
      if (normalized === 'main') {
        setActiveThread('main')
      } else if (normalized === 'role') {
        setActiveThread('role')
      } else if (normalized === 'whisper') {
        setScopeInternal('whisper')
        if (whisperTarget) {
          setActiveThread(`whisper:${whisperTarget}`)
        } else {
          setWhisperTargetInternal(null)
        }
      } else {
        setActiveThread('global')
      }
    },
    [setActiveThread, setScopeInternal, setWhisperTargetInternal, whisperTarget],
  )

  const handleSetWhisperTarget = useCallback(
    (target) => {
      if (target) {
        setActiveThread(`whisper:${target}`)
      } else {
        setActiveThread('global')
      }
    },
    [setActiveThread],
  )

  const clearThread = useCallback(
    (threadId) => {
      if (!threadId || threadId === 'global') return
      if (!threadId.startsWith('whisper:')) return
      const targetHeroId = threadId.split(':')[1] || null

      setMessages((prev) => {
        const filtered = prev.filter((message) => {
          if (message?.scope !== 'whisper') return true
          const viewerId = viewerHeroRef.current
          if (!viewerId) return true
          const counterpart = message.hero_id === viewerId ? message.target_hero_id : message.hero_id
          return String(counterpart || '') !== String(targetHeroId || '')
        })
        return limitMessages(filtered)
      })

      setUnreadThreads((prev) => {
        if (!prev[threadId]) return prev
        const next = { ...prev }
        delete next[threadId]
        return next
      })

      if (activeThreadRef.current === threadId) {
        activeThreadRef.current = 'global'
        setActiveThreadState('global')
        setScopeInternal('global')
        setWhisperTargetInternal(null)
      } else {
        setWhisperTargetInternal((prev) => (prev === targetHeroId ? null : prev))
      }
    },
    [limitMessages, setActiveThreadState, setScopeInternal, setWhisperTargetInternal],
  )

  const send = async () => {
    const text = input.trim()
    if (!text) return

    try {
      const user = await getCurrentUser()
      if (!user) {
        alert('로그인 필요')
        return
      }

      const activeHeroId = viewerHeroRef.current

      if (scope === 'whisper') {
        if (!activeHeroId) {
          alert('귓속말을 보내려면 사용할 캐릭터를 선택하세요.')
          return
        }
        if (!whisperTarget) {
          alert('귓속말 대상 캐릭터를 선택하세요.')
          return
        }
      }

      setInput('')

      const fallbackHeroId = hintProfile?.hero_id || null

      const payload = {
        hero_id: activeHeroId || fallbackHeroId,
        scope,
        target_hero_id: scope === 'whisper' ? whisperTarget : null,
        target_role: scope === 'role' ? viewerRoleValue || null : null,
        text,
      }

      const draftyDoc = createDraftyFromText(text)
      const draftySummary = inspectDrafty(draftyDoc)
      payload.metadata = {
        drafty: draftyDoc,
        plain_text: draftySummary.plainText || text,
        summary: {
          has_links: draftySummary.hasLinks,
          has_mentions: draftySummary.hasMentions,
          has_hashtags: draftySummary.hasHashtags,
        },
      }

      const contextSnapshot = chatContextRef.current || {}

      await insertMessage(payload, {
        sessionId: contextSnapshot.sessionId || sessionId || null,
        matchInstanceId: contextSnapshot.matchInstanceId || matchInstanceId || null,
        gameId: contextSnapshot.gameId || gameId || null,
        roomId: contextSnapshot.roomId || roomId || null,
      })

      try {
        const hydrated = await fetchAndHydrateMessages()
        replaceMessages(hydrated)
        scrollToBottom()
      } catch (refreshError) {
        console.error('메시지를 새로고침하지 못했습니다.', refreshError)
      }

      if (typeof onSend === 'function') {
        try {
          await onSend(text, payload)
        } catch (hookError) {
          console.error('외부 채팅 후크 실행 중 오류가 발생했습니다.', hookError)
        }
      }
    } catch (error) {
      console.error('메시지를 보내지 못했습니다.', error)
      alert(error?.message || '메시지를 보내지 못했습니다.')
    }
  }

  const totalUnread = useMemo(() => {
    return Object.values(unreadThreads).reduce((sum, count) => sum + count, 0)
  }, [unreadThreads])

  return {
    activeThread,
    availableTargets,
    blockedHeroSet,
    blockedHeroes,
    blockedHeroEntries,
    canSend,
    heroDirectory,
    input,
    listRef,
    me,
    messages,
    primaryThreads,
    scope,
    scopeOptions,
    send,
    setActiveThread,
    setBlockedHeroes,
    setInput,
    setScope: handleSetScope,
    setWhisperTarget: handleSetWhisperTarget,
    threadList: whisperThreads,
    totalUnread,
    unreadThreads,
    viewerHeroId,
    visibleMessages,
    whisperTarget,
    clearThread,
    refreshMessages: async () => {
      try {
        const hydrated = await fetchAndHydrateMessages()
        replaceMessages(hydrated)
        scrollToBottom()
      } catch (error) {
        console.error('채팅을 새로고침하지 못했습니다.', error)
      }
    },
  }
}

export function useSharedChatDock(options = {}) {
  const contextValue = useContext(SharedChatDockContext)
  if (contextValue) {
    return contextValue
  }
  return useSharedChatDockInternal(options)
}

export function SharedChatDockProvider({ children, ...options }) {
  const controller = useSharedChatDockInternal(options)
  return (
    <SharedChatDockContext.Provider value={controller}>{children}</SharedChatDockContext.Provider>
  )
}

export function useSharedChatDockContext() {
  return useContext(SharedChatDockContext)
}
