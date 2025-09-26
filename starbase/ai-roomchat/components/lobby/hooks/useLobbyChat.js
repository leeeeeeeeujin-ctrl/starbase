import { useCallback, useEffect, useRef, useState } from 'react'

import {
  fetchRecentMessages,
  getCurrentUser,
  insertMessage,
  subscribeToMessages,
} from '../../../lib/chat/messages'
import { resolveViewerProfile } from '../../../lib/heroes/resolveViewerProfile'

const DEFAULT_VIEWER = {
  name: '익명',
  avatar_url: null,
  hero_id: null,
  owner_id: null,
  user_id: null,
}

export default function useLobbyChat({ heroId, onRequireAuth } = {}) {
  const [viewer, setViewer] = useState(DEFAULT_VIEWER)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const listRef = useRef(null)
  const viewerRef = useRef(DEFAULT_VIEWER)

  useEffect(() => {
    viewerRef.current = viewer
  }, [viewer])

  useEffect(() => {
    let alive = true

    const resolveProfile = async () => {
      try {
        const user = await getCurrentUser()
        if (!alive) return

        if (!user) {
          setViewer(DEFAULT_VIEWER)
          onRequireAuth?.()
          return
        }

        const profile = await resolveViewerProfile(user, heroId)
        if (!alive) return
        setViewer(profile)
      } catch (error) {
        console.error('로비 채팅 프로필을 불러오지 못했습니다.', error)
      }
    }

    resolveProfile()

    return () => {
      alive = false
    }
  }, [heroId, onRequireAuth])

  useEffect(() => {
    let alive = true

    const bootstrapMessages = async () => {
      try {
        const data = await fetchRecentMessages({ limit: 100 })
        if (!alive) return
        setMessages(data)
        setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
      } catch (error) {
        console.error('로비 채팅 메시지를 불러오지 못했습니다.', error)
      }
    }

    bootstrapMessages()

    const unsubscribe = subscribeToMessages({
      channelName: 'lobby-chat-stream',
      onInsert: (message) => {
        setMessages((prev) => {
          const next = [...prev, message]
          return next.length > 200 ? next.slice(next.length - 200) : next
        })
        setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
      },
    })

    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [])

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
    setViewer(profile)
    return profile
  }, [heroId])

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
//
