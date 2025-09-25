// components/SharedChatDock.js
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { withTable } from '@/lib/supabaseTables'

export default function SharedChatDock({
  height = 320,
  heroId,
  command,
  onRequestAddFriend,
  onRequestProfile,
}) {
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
  const inputRef = useRef(null)
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

  useEffect(() => {
    if (!command) return
    if (command.type === 'whisper' && command.heroId) {
      setScope('whisper')
      setWhisperTarget(command.heroId)
      if (typeof command.prefill === 'string') {
        setInput(command.prefill)
      }
      setTimeout(() => {
        inputRef.current?.focus()
      }, 80)
    }
  }, [command])

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
          const { data: hero } = await withTable(supabase, 'heroes', (table) =>
            supabase.from(table).select('id,name,image_url,owner_id').eq('id', heroId).single(),
          )
          if (hero) return { name: hero.name, avatar_url: hero.image_url || null, hero_id: hero.id }
        }

        const { data: myHero } = await withTable(supabase, 'heroes', (table) =>
          supabase
            .from(table)
            .select('id,name,image_url')
            .eq('owner_id', user.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle(),
        )
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
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(200)
      if (!alive) return

      if (error) {
        try {
          const res = await fetch(`/api/messages/list?limit=200`)
          if (!res.ok) throw new Error(await res.text())
          const payload = await res.json()
          setMsgs(Array.isArray(payload.data) ? payload.data : [])
        } catch (fallbackError) {
          console.warn('SharedChatDock: failed to load messages via fallback', fallbackError)
          setMsgs([])
        }
      } else {
        setMsgs(data || [])
      }
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
    if (error) {
      console.warn('SharedChatDock: primary send failed, attempting fallback', error.message)
      try {
        const res = await fetch('/api/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || 'fallback send failed')
        }
      } catch (fallbackErr) {
        console.error('SharedChatDock: fallback send failed', fallbackErr)
        alert(error.message)
      }
    }
  }

  function handlePortraitClick(message) {
    if (!message?.hero_id) return
    const heroName = heroDirectory.get(message.hero_id) || message.username || '익명'
    const payload = {
      heroId: message.hero_id,
      heroName,
      avatarUrl: message.avatar_url || null,
      isSelf: Boolean(viewerHeroId && message.hero_id === viewerHeroId),
    }

    if (typeof onRequestProfile === 'function') {
      onRequestProfile(payload)
      return
    }

    if (payload.isSelf) return

    setScope('whisper')
    setWhisperTarget(message.hero_id)
    setTimeout(() => {
      inputRef.current?.focus()
    }, 80)
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
              <button
                type="button"
                onClick={() => handlePortraitClick(message)}
                disabled={!message?.hero_id}
                title={message?.hero_id ? `${senderName} 프로필` : undefined}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: 'none',
                  padding: 0,
                  overflow: 'hidden',
                  background: 'transparent',
                  cursor: message?.hero_id ? 'pointer' : 'default',
                }}
              >
                {message.avatar_url ? (
                  <img
                    src={message.avatar_url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background: '#e5e7eb',
                    }}
                  />
                )}
              </button>
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
                    {onRequestAddFriend ? (
                      <button
                        onClick={() =>
                          onRequestAddFriend({
                            heroId: message.hero_id,
                            heroName: senderName,
                            avatarUrl: message.avatar_url || null,
                          })
                        }
                        style={{
                          fontSize: 11,
                          padding: '4px 8px',
                          borderRadius: 8,
                          border: '1px solid #38bdf8',
                          background: 'rgba(56, 189, 248, 0.12)',
                          color: '#0284c7',
                        }}
                      >
                        친구 추가
                      </button>
                    ) : null}
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
          ref={inputRef}
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

// 
