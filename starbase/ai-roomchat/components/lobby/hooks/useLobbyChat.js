import { useCallback, useEffect, useRef, useState } from 'react'

import {
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

const DEFAULT_VIEWER = {
  name: '익명',
  avatar_url: null,
  hero_id: null,
  owner_id: null,
  user_id: null,
}

const VIEWER_STORAGE_KEY = 'ai-roomchat:lobbyChatViewer'

function readStoredViewer() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(VIEWER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.user_id) return null
    return {
      name: parsed.name ?? DEFAULT_VIEWER.name,
      avatar_url: parsed.avatar_url ?? DEFAULT_VIEWER.avatar_url,
      hero_id: parsed.hero_id ?? null,
      owner_id: parsed.owner_id ?? null,
      user_id: parsed.user_id,
    }
  } catch (error) {
    console.error('로비 채팅 로컬 프로필을 불러오지 못했습니다.', error)
    return null
  }
}

function persistStoredViewer(viewer) {
  if (typeof window === 'undefined') return
  try {
    if (viewer?.user_id) {
      window.localStorage.setItem(
        VIEWER_STORAGE_KEY,
        JSON.stringify({
          name: viewer.name ?? DEFAULT_VIEWER.name,
          avatar_url: viewer.avatar_url ?? null,
          hero_id: viewer.hero_id ?? null,
          owner_id: viewer.owner_id ?? null,
          user_id: viewer.user_id,
        }),
      )
    } else {
      window.localStorage.removeItem(VIEWER_STORAGE_KEY)
    }
  } catch (error) {
    console.error('로비 채팅 로컬 프로필을 저장하지 못했습니다.', error)
  }
}

export default function useLobbyChat({ heroId, onRequireAuth } = {}) {
  const initialViewer = readStoredViewer() ?? DEFAULT_VIEWER
  const [viewer, setViewerState] = useState(initialViewer)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const listRef = useRef(null)
  const viewerRef = useRef(initialViewer)
  const heroCacheRef = useRef(new Map())
  const ownerCacheRef = useRef(new Map())

  const buildHydrationHints = useCallback(() => {
    const hints = []
    const currentViewer = viewerRef.current
    if (currentViewer?.hero_id) {
      hints.push({
        heroId: currentViewer.hero_id,
        heroName: currentViewer.name,
        avatarUrl: currentViewer.avatar_url,
        ownerId: currentViewer.owner_id,
        userId: currentViewer.user_id,
      })
    }
    if (heroId && (!currentViewer || currentViewer.hero_id !== heroId)) {
      hints.push({ heroId })
    }
    return hints
  }, [heroId])

  const hydrateBatch = useCallback(
    async (rawMessages) => {
      const { messages: hydrated } = await hydrateMessageList(rawMessages, {
        viewer: viewerRef.current,
        hints: buildHydrationHints(),
        heroCache: heroCacheRef.current,
        ownerCache: ownerCacheRef.current,
      })
      return hydrated
    },
    [buildHydrationHints],
  )

  const hydrateSingle = useCallback(
    async (rawMessage) => {
      const { message: hydrated } = await hydrateIncomingMessage(rawMessage, {
        viewer: viewerRef.current,
        hints: buildHydrationHints(),
        heroCache: heroCacheRef.current,
        ownerCache: ownerCacheRef.current,
      })
      return hydrated
    },
    [buildHydrationHints],
  )

  const updateViewer = useCallback((nextViewer) => {
    if (!nextViewer) {
      viewerRef.current = DEFAULT_VIEWER
      setViewerState(DEFAULT_VIEWER)
      persistStoredViewer(DEFAULT_VIEWER)
      return
    }

    const resolved = {
      name: nextViewer.name ?? DEFAULT_VIEWER.name,
      avatar_url: nextViewer.avatar_url ?? null,
      hero_id: nextViewer.hero_id ?? null,
      owner_id: nextViewer.owner_id ?? null,
      user_id: nextViewer.user_id ?? null,
    }

    const previous = viewerRef.current
    if (
      previous?.user_id &&
      resolved.user_id &&
      previous.user_id === resolved.user_id &&
      !resolved.hero_id &&
      previous.hero_id
    ) {
      resolved.hero_id = previous.hero_id
      resolved.name = previous.name ?? resolved.name
      resolved.avatar_url = previous.avatar_url ?? resolved.avatar_url
      resolved.owner_id = previous.owner_id ?? resolved.owner_id
    }

    viewerRef.current = resolved
    setViewerState(resolved)
    persistStoredViewer(resolved)
  }, [])

  useEffect(() => {
    let alive = true

    const resolveProfile = async () => {
      try {
        const user = await getCurrentUser()
        if (!alive) return

        if (!user) {
          updateViewer(DEFAULT_VIEWER)
          onRequireAuth?.()
          return
        }

        const profile = await resolveViewerProfile(user, heroId)
        if (!alive) return
        updateViewer(profile)
      } catch (error) {
        console.error('로비 채팅 프로필을 불러오지 못했습니다.', error)
      }
    }

    resolveProfile()

    return () => {
      alive = false
    }
  }, [heroId, onRequireAuth, updateViewer])

  useEffect(() => {
    let alive = true

    const bootstrapMessages = async () => {
      try {
        const data = await fetchRecentMessages({ limit: 100 })
        if (!alive) return
        const hydrated = await hydrateBatch(data)
        if (!alive) return
        setMessages(hydrated)
        setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
      } catch (error) {
        console.error('로비 채팅 메시지를 불러오지 못했습니다.', error)
      }
    }

    const handleInsert = async (incoming) => {
      try {
        const hydrated = await hydrateSingle(incoming)
        if (!alive || !hydrated) return
        setMessages((prev) => {
          const next = [...prev, hydrated]
          return next.length > 200 ? next.slice(next.length - 200) : next
        })
        setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
      } catch (error) {
        console.error('실시간 로비 채팅 메시지를 처리하지 못했습니다.', error)
      }
    }

    bootstrapMessages()

    const unsubscribe = subscribeToMessages({
      channelName: 'lobby-chat-stream',
      onInsert: (message) => {
        handleInsert(message)
      },
    })

    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [hydrateBatch, hydrateSingle])

  const ensureViewer = useCallback(async () => {
    const cached = viewerRef.current
    if (cached?.user_id && cached?.hero_id) {
      return cached
    }

    const user = await getCurrentUser()
    if (!user) {
      return null
    }

    const profile = await resolveViewerProfile(user, heroId)
    updateViewer(profile)
    return profile
  }, [heroId, updateViewer])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text) return

    try {
      const user = await getCurrentUser()
      if (!user) {
        onRequireAuth?.()
        alert('로그인이 필요합니다.')
        return
      }

      let profile = viewerRef.current
      if (!profile?.hero_id || !profile?.user_id) {
        profile = await ensureViewer()
      }

      if (!profile?.hero_id) {
        alert('채팅에 사용할 캐릭터를 먼저 선택하세요.')
        return
      }

      setInput('')

      await insertMessage({
        user_id: profile.user_id || user.id,
        owner_id: profile.owner_id || user.id,
        username: profile.name,
        avatar_url: profile.avatar_url,
        hero_id: profile.hero_id,
        scope: 'global',
        target_hero_id: null,
        text,
      })
    } catch (error) {
      console.error('메시지를 보내지 못했습니다.', error)
      alert(error?.message || '메시지를 보내지 못했습니다.')
    }
  }, [ensureViewer, input, onRequireAuth])

  return {
    displayName: viewer?.name || '익명',
    avatarUrl: viewer?.avatar_url || null,
    messages,
    input,
    setInput,
    listRef,
    sendMessage,
  }
}
