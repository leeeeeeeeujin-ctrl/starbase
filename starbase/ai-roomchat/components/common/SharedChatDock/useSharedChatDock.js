'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { withTable } from '../../../lib/supabaseTables'

const BLOCKED_STORAGE_KEY = 'starbase_blocked_heroes'

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
    // ignore
  }
}

async function resolveViewerProfile(user, explicitHeroId) {
  if (!user) return { name: '익명', avatar_url: null, hero_id: null }

  if (explicitHeroId) {
    const { data: hero } = await withTable(supabase, 'heroes', (table) =>
      supabase
        .from(table)
        .select('id,name,image_url,owner_id')
        .eq('id', explicitHeroId)
        .single()
    )
    if (hero) {
      return {
        name: hero.name,
        avatar_url: hero.image_url || null,
        hero_id: hero.id,
      }
    }
  }

  const { data: myHero } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select('id,name,image_url')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
  )

  if (myHero) {
    return {
      name: myHero.name,
      avatar_url: myHero.image_url || null,
      hero_id: myHero.id,
    }
  }

  const meta = user?.user_metadata || {}
  return {
    name: meta.full_name || meta.name || (user.email?.split('@')[0] ?? '익명'),
    avatar_url: meta.avatar_url || null,
    hero_id: null,
  }
}

export function useSharedChatDock({ heroId }) {
  const listRef = useRef(null)
  const [messages, setMessages] = useState([])
  const [me, setMe] = useState({ name: '익명', avatar_url: null, hero_id: null })
  const [input, setInput] = useState('')
  const [scope, setScope] = useState('global')
  const [whisperTarget, setWhisperTarget] = useState(null)
  const [blockedHeroes, setBlockedHeroes] = useState(() => loadBlockedHeroes())

  const blockedHeroSet = useMemo(
    () => new Set(blockedHeroes.filter(Boolean)),
    [blockedHeroes],
  )

  const viewerHeroId = heroId || me.hero_id || null

  const heroDirectory = useMemo(() => {
    const directory = new Map()
    for (const message of messages) {
      if (message?.hero_id && message?.username && !directory.has(message.hero_id)) {
        directory.set(message.hero_id, message.username)
      }
    }
    if (viewerHeroId && me?.name && !directory.has(viewerHeroId)) {
      directory.set(viewerHeroId, me.name)
    }
    return directory
  }, [me.name, messages, viewerHeroId])

  const availableTargets = useMemo(() => {
    const list = []
    heroDirectory.forEach((username, id) => {
      if (!id || id === viewerHeroId) return
      list.push({ heroId: id, username })
    })
    list.sort((a, b) => a.username.localeCompare(b.username, 'ko'))
    return list
  }, [heroDirectory, viewerHeroId])

  const visibleMessages = useMemo(() => {
    return messages.filter((message) => {
      if (message?.hero_id && blockedHeroSet.has(message.hero_id) && message.hero_id !== viewerHeroId) {
        return false
      }
      if (message?.scope === 'whisper') {
        if (!viewerHeroId) return false
        return message.hero_id === viewerHeroId || message.target_hero_id === viewerHeroId
      }
      if (message?.scope === 'blocked') {
        return false
      }
      return true
    })
  }, [blockedHeroSet, messages, viewerHeroId])

  const canSend = useMemo(() => {
    if (!input.trim()) return false
    if (scope === 'whisper' && !whisperTarget) return false
    return true
  }, [input, scope, whisperTarget])

  useEffect(() => {
    persistBlockedHeroes(blockedHeroes)
  }, [blockedHeroes])

  useEffect(() => {
    if (scope !== 'whisper') {
      setWhisperTarget(null)
    }
  }, [scope])

  useEffect(() => {
    let alive = true

    const scrollToBottom = () => {
      setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
    }

    const bootstrap = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive || !user) return

      const profile = await resolveViewerProfile(user, heroId)
      if (!alive) return
      setMe(profile)

      const { data } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(200)
      if (!alive) return
      setMessages(data || [])
      scrollToBottom()
    }

    bootstrap()

    const channel = supabase
      .channel('messages-shared-dock')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => {
          const next = [...prev, payload.new]
          return next.length > 200 ? next.slice(next.length - 200) : next
        })
        scrollToBottom()
      })
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [heroId])

  const send = async () => {
    const text = input.trim()
    if (!text) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert('로그인 필요')
      return
    }

    const activeHeroId = viewerHeroId

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

    const payload = {
      user_id: user.id,
      owner_id: user.id,
      username: me.name,
      avatar_url: me.avatar_url,
      hero_id: activeHeroId,
      scope,
      target_hero_id: scope === 'whisper' ? whisperTarget : null,
      text,
    }

    const { error } = await supabase.from('messages').insert(payload)
    if (error) alert(error.message)
  }

  return {
    availableTargets,
    blockedHeroSet,
    blockedHeroes,
    canSend,
    heroDirectory,
    input,
    listRef,
    me,
    scope,
    send,
    setBlockedHeroes,
    setInput,
    setScope,
    setWhisperTarget,
    visibleMessages,
    viewerHeroId,
    whisperTarget,
  }
}

//
