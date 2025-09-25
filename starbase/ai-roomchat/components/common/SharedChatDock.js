// components/SharedChatDock.js
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function SharedChatDock({ height = 320, heroId }) {
  const [msgs, setMsgs] = useState([])
  const [me, setMe] = useState({ name: '익명', avatar_url: null, hero_id: null })
  const [input, setInput] = useState('')
  const [scope, setScope] = useState('global')
  const [whisperTarget, setWhisperTarget] = useState(null)
  const [blockedHeroes, setBlockedHeroes] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem('starbase_blocked_heroes')
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      return []
    }
  })
  const listRef = useRef(null)
  const blockedHeroSet = useMemo(() => new Set(blockedHeroes.filter(Boolean)), [blockedHeroes])
  const viewerHeroId = heroId || me.hero_id || null
  const heroDirectory = useMemo(() => {
    const map = new Map()
    for (const message of msgs) {
      if (message?.hero_id && message?.username && !map.has(message.hero_id)) {
        map.set(message.hero_id, message.username)
      }
    }
    if (viewerHeroId && me?.name && !map.has(viewerHeroId)) {
      map.set(viewerHeroId, me.name)
    }
    return map
  }, [me.name, msgs, viewerHeroId])
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
    return msgs.filter((message) => {
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
  }, [blockedHeroSet, msgs, viewerHeroId])

  useEffect(() => {
    if (scope !== 'whisper') {
      setWhisperTarget(null)
    }
  }, [scope])

  const canSend = useMemo(() => {
    if (!input.trim()) return false
    if (scope === 'whisper' && !whisperTarget) return false
    return true
  }, [input, scope, whisperTarget])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('starbase_blocked_heroes', JSON.stringify(blockedHeroes))
  }, [blockedHeroes])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) return

      async function resolveProfile() {
        if (heroId) {
          const { data: hero } = await supabase
            .from('heroes')
            .select('id,name,image_url,owner_id')
            .eq('id', heroId)
            .single()
          if (hero) return { name: hero.name, avatar_url: hero.image_url || null, hero_id: hero.id }
        }

        const { data: myHero } = await supabase
          .from('heroes')
          .select('id,name,image_url')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (myHero) return { name: myHero.name, avatar_url: myHero.image_url || null, hero_id: myHero.id }

        const meta = user?.user_metadata || {}
        return {
          name: meta.full_name || meta.name || (user.email?.split('@')[0] ?? '익명'),
          avatar_url: meta.avatar_url || null,
          hero_id: null,
        }
      }

      const profile = await resolveProfile()
      if (!alive) return
      setMe(profile)

      // 메시지 초기 로드 (오래된 → 최신, 아래가 최신)
      const { data } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(200)
      if (!alive) return
      setMsgs(data || [])
      // 처음 로드되면 스크롤 맨 아래로
      setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
    })()

    const ch = supabase
      .channel('messages-shared-dock')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        setMsgs((prev) => {
          const next = [...prev, p.new]
          return next.length > 200 ? next.slice(next.length - 200) : next
        })
        setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
      })
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(ch)
    }
  }, [heroId])

  async function send() {
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

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#fff',
        height,
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #e5e7eb',
          background: '#f9fafb',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {me.avatar_url
          ? <img src={me.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
          : <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#e5e7eb' }} />
        }
        <span>공유 로비 채팅</span>
      </div>

      {/* 최신이 아래 */}
      <div ref={listRef} style={{ padding: 12, overflow: 'auto' }}>
        {visibleMessages.map((message) => {
          const senderName = heroDirectory.get(message.hero_id) || message.username || '익명'
          const targetName = message.target_hero_id ? heroDirectory.get(message.target_hero_id) : null
          const isSelf = viewerHeroId && message.hero_id === viewerHeroId
          const blocked = message.hero_id && blockedHeroSet.has(message.hero_id)
          return (
            <div
              key={message.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr',
                gap: 8,
                padding: '6px 0',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              {message.avatar_url
                ? <img src={message.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e5e7eb' }} />
              }
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 13 }}>{senderName}</b>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {new Date(message.created_at).toLocaleTimeString()}
                  </span>
                  {message.scope === 'whisper' && (
                    <span
                      style={{
                        fontSize: 11,
                        color: '#0ea5e9',
                        border: '1px solid #0ea5e9',
                        borderRadius: 999,
                        padding: '0 6px',
                      }}
                    >
                      귓속말{targetName ? ` → ${targetName}` : ''}
                    </span>
                  )}
                  {blocked && (
                    <span style={{ fontSize: 11, color: '#ef4444' }}>차단됨</span>
                  )}
                </div>
                <div style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{message.text}</div>
                {message.hero_id && !isSelf && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                    {blocked ? (
                      <button
                        onClick={() => setBlockedHeroes((prev) => prev.filter((id) => id !== message.hero_id))}
                        style={{
                          fontSize: 11,
                          padding: '4px 8px',
                          borderRadius: 8,
                          border: '1px solid #ef4444',
                          background: '#fff',
                          color: '#ef4444',
                        }}
                      >
                        차단 해제
                      </button>
                    ) : (
                      <button
                        onClick={() => setBlockedHeroes((prev) => [...new Set([...prev, message.hero_id])])}
                        style={{
                          fontSize: 11,
                          padding: '4px 8px',
                          borderRadius: 8,
                          border: '1px solid #cbd5f5',
                          background: '#f8fafc',
                        }}
                      >
                        차단하기
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: 12,
          borderTop: '1px solid #e5e7eb',
          background: '#fafafa',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            style={{ borderRadius: 8, padding: '8px 10px', border: '1px solid #d1d5db' }}
          >
            <option value="global">전체 공개</option>
            <option value="whisper">귓속말</option>
          </select>
          {scope === 'whisper' && (
            <select
              value={whisperTarget || ''}
              onChange={(e) => setWhisperTarget(e.target.value || null)}
              style={{ borderRadius: 8, padding: '8px 10px', border: '1px solid #d1d5db', minWidth: 160 }}
            >
              <option value="">대상 선택</option>
              {availableTargets.map((target) => (
                <option key={target.heroId} value={target.heroId}>
                  {target.username}
                </option>
              ))}
            </select>
          )}
        </div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              send()
            }
          }}
          placeholder="메시지를 입력…"
          style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}
        />
        <button
          onClick={send}
          disabled={!canSend}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: canSend ? '#2563eb' : '#93c5fd',
            color: '#fff',
            cursor: canSend ? 'pointer' : 'not-allowed',
          }}
        >
          보내기
        </button>
      </div>
    </div>
  )
}
