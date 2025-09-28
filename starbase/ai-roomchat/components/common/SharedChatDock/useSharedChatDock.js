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
  onSend,
  onNotify,
}) {
  const listRef = useRef(null)
  const activeThreadRef = useRef('global')
  const viewerHeroRef = useRef(null)
  const messageIdSetRef = useRef(new Set())

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

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
  }, [])

  const replaceMessages = useCallback((nextMessages) => {
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
    setMessages(limited)
  }, [])

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
    const data = await fetchRecentMessages({ limit: MESSAGE_LIMIT })
    return hydrateBatch(data)
  }, [hydrateBatch])

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

  const whisperThreads = useMemo(() => {
    if (!viewerHeroId) return []
    const map = new Map()
    for (const message of messages) {
      if (message?.scope !== 'whisper') continue
      if (message.hero_id !== viewerHeroId && message.target_hero_id !== viewerHeroId) continue
      const counterpart = message.hero_id === viewerHeroId ? message.target_hero_id : message.hero_id
      if (!counterpart) continue
      const meta = heroDirectory.get(counterpart)
      const existing = map.get(counterpart) || {
        heroId: counterpart,
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
      map.set(counterpart, existing)
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

  const visibleMessages = useMemo(() => {
    return messages.filter((message) => {
      if (message?.hero_id && blockedHeroSet.has(message.hero_id) && message.hero_id !== viewerHeroId) {
        return false
      }
      if (message?.scope === 'blocked') {
        return false
      }
      if (activeThread === 'global') {
        return message?.scope !== 'whisper'
      }
      if (message?.scope !== 'whisper') return false
      if (!viewerHeroId) return false
      if (message.hero_id !== viewerHeroId && message.target_hero_id !== viewerHeroId) {
        return false
      }
      const counterpart = message.hero_id === viewerHeroId ? message.target_hero_id : message.hero_id
      return counterpart === activeThread
    })
  }, [activeThread, blockedHeroSet, messages, viewerHeroId])

  const canSend = useMemo(() => {
    if (!input.trim()) return false
    if (scope === 'whisper' && !whisperTarget) return false
    return true
  }, [input, scope, whisperTarget])

  useEffect(() => {
    persistBlockedHeroes(blockedHeroes)
  }, [blockedHeroes])

  useEffect(() => {
    setActiveThread('global')
    setUnreadThreads({})
  }, [viewerHeroId])

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
        if (hydrated?.scope === 'whisper' && viewerId) {
          const isParticipant =
            hydrated.hero_id === viewerId || hydrated.target_hero_id === viewerId
          const isSelf = hydrated.hero_id === viewerId
          const threadId =
            hydrated.hero_id === viewerId ? hydrated.target_hero_id : hydrated.hero_id
          if (isParticipant && !isSelf && threadId && threadId !== activeThreadRef.current) {
            setUnreadThreads((prev) => ({
              ...prev,
              [threadId]: (prev[threadId] || 0) + 1,
            }))
          }
        }

        scrollToBottom()

        if (typeof onNotify === 'function') {
          const scope = hydrated?.scope || 'global'
          let threadId = 'global'
          if (scope === 'whisper' && viewerId) {
            if (hydrated.hero_id === viewerId) {
              threadId = hydrated.target_hero_id || 'global'
            } else {
              threadId = hydrated.hero_id || 'global'
            }
          }
          onNotify({ message: hydrated, scope, threadId })
        }
      } catch (error) {
        console.error('실시간 메시지를 처리하지 못했습니다.', error)
      }
    }

    const unsubscribe = subscribeToMessages({
      channelName: 'messages-shared-dock',
      onInsert: (message) => {
        handleInsert(message)
      },
    })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [fetchAndHydrateMessages, heroId, hydrateSingle, viewerHero, hintProfile, replaceMessages, scrollToBottom, onNotify])

  const setActiveThread = (thread) => {
    const normalized = thread || 'global'
    setActiveThreadState(normalized)
    if (normalized === 'global') {
      setScopeInternal('global')
      setWhisperTargetInternal(null)
    } else {
      setScopeInternal('whisper')
      setWhisperTargetInternal(normalized)
    }
  }

  const handleSetScope = (nextScope) => {
    if (nextScope === 'global') {
      setActiveThread('global')
    } else {
      setScopeInternal('whisper')
      if (whisperTarget) {
        setActiveThreadState(whisperTarget)
      }
    }
  }

  const handleSetWhisperTarget = (target) => {
    if (target) {
      setActiveThread(target)
    } else {
      setActiveThread('global')
    }
  }

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

      const fallbackOwnerId = hintProfile?.owner_id || hintProfile?.user_id || user.id
      const fallbackHeroId = hintProfile?.hero_id || null
      const fallbackName = hintProfile?.name || DEFAULT_VIEWER.name
      const fallbackAvatar = hintProfile?.avatar_url ?? null

      const payload = {
        user_id: user.id,
        owner_id: me.owner_id || fallbackOwnerId,
        username:
          me.name && me.name !== DEFAULT_VIEWER.name ? me.name : fallbackName,
        avatar_url: me.avatar_url ?? fallbackAvatar,
        hero_id: activeHeroId || fallbackHeroId,
        scope,
        target_hero_id: scope === 'whisper' ? whisperTarget : null,
        text,
      }

      await insertMessage(payload)

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
    canSend,
    heroDirectory,
    input,
    listRef,
    me,
    messages,
    scope,
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
