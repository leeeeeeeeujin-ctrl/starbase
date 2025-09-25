import { useEffect, useRef, useState } from 'react'

import { supabase } from '../../../lib/supabase'

export default function useLobbyChat({ heroId, onRequireAuth } = {}) {
  const [displayName, setDisplayName] = useState('익명')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    let mounted = true

    async function resolveProfile() {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return

      const user = data?.user
      if (!user) {
        onRequireAuth?.()
        return
      }

      let name = null
      let avatar = null

      if (heroId) {
        const { data: hero } = await supabase
          .from('heroes')
          .select('name,image_url')
          .eq('id', heroId)
          .single()
        if (hero) {
          name = hero.name
          avatar = hero.image_url || null
        }
      }

      if (!name) {
        const { data: heroes } = await supabase
          .from('heroes')
          .select('name,image_url')
          .order('created_at', { ascending: true })
          .limit(1)
        if (heroes && heroes.length > 0) {
          name = heroes[0].name
          avatar = heroes[0].image_url || null
        }
      }

      if (!name) {
        const meta = user?.user_metadata || {}
        name = meta.full_name || meta.name || (user?.email ? user.email.split('@')[0] : '익명')
        avatar = meta.avatar_url || null
      }

      if (!mounted) return
      setDisplayName(name)
      setAvatarUrl(avatar)
    }

    resolveProfile()

    return () => {
      mounted = false
    }
  }, [heroId, onRequireAuth])

  useEffect(() => {
    let mounted = true

    async function bootstrapMessages() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100)

      if (!mounted) return
      if (error) {
        console.error(error)
        return
      }

      setMessages(data || [])
      setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
    }

    bootstrapMessages()

    const channel = supabase
      .channel('messages-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => [...prev, payload.new])
        setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      mounted = false
    }
  }, [])

  async function sendMessage() {
    if (!input.trim()) return

    const { data } = await supabase.auth.getUser()
    const user = data?.user
    if (!user) {
      alert('로그인이 필요합니다.')
      return
    }

    const text = input.trim()
    setInput('')

    const { error } = await supabase.from('messages').insert({
      owner_id: user.id,
      username: displayName,
      avatar_url: avatarUrl,
      text,
    })

    if (error) {
      console.error(error)
      alert(error.message)
    }
  }

  return {
    displayName,
    avatarUrl,
    messages,
    input,
    setInput,
    listRef,
    sendMessage,
  }
}
//
