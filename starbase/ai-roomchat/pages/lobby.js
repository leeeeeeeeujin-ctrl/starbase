import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

import { supabase } from '../lib/supabase'

const NAV = [
  { label: '게임 제작', href: '/maker' },
  { label: '플레이', href: '/play' },
  { label: '사설', href: '/private' },
  { label: '랭킹', href: '/rank' },
]

const TABS = [
  { key: 'chat', label: '공용 채팅' },
  { key: 'games', label: '게임 찾기' },
  { key: 'alerts', label: '알림' },
]

const SORT_OPTIONS = [
  { key: 'latest', label: '최신순', orders: [{ column: 'created_at', asc: false }] },
  { key: 'likes', label: '좋아요순', orders: [{ column: 'likes_count', asc: false }, { column: 'created_at', asc: false }] },
  { key: 'plays', label: '게임횟수순', orders: [{ column: 'play_count', asc: false }, { column: 'created_at', asc: false }] },
]

export default function Lobby() {
  const router = useRouter()
  const { heroId } = router.query

  const [activeTab, setActiveTab] = useState('chat')

  // 채팅 상태
  const [displayName, setDisplayName] = useState('익명')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  // 게임 검색 상태
  const [gameQuery, setGameQuery] = useState('')
  const [debouncedGameQuery, setDebouncedGameQuery] = useState('')
  const [gameSort, setGameSort] = useState('latest')
  const [gameRows, setGameRows] = useState([])
  const [gameLoading, setGameLoading] = useState(false)
  const [selectedGame, setSelectedGame] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [gameRoles, setGameRoles] = useState([])
  const [participants, setParticipants] = useState([])
  const [roleChoice, setRoleChoice] = useState('')

  // 채팅 프로필 결정
  useEffect(() => {
    let mounted = true
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }

      let name = null
      let avatar = null

      if (heroId) {
        const { data: hero } = await supabase
          .from('heroes')
          .select('name,image_url,owner_id')
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
    init()
    return () => { mounted = false }
  }, [heroId, router])

  // 채팅 구독
  useEffect(() => {
    let mounted = true
    async function bootstrap() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100)
      if (!mounted) return
      if (error) alert(error.message)
      setMessages(data || [])
      setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
    }
    bootstrap()

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

  async function send() {
    if (!input.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert('로그인이 필요합니다.'); return }

    const text = input.trim()
    setInput('')

    const { error } = await supabase.from('messages').insert({
      owner_id: user.id,
      username: displayName,
      avatar_url: avatarUrl,
      text,
    })
    if (error) alert(error.message)
  }

  // 게임 검색 디바운스
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedGameQuery(gameQuery), 250)
    return () => clearTimeout(timer)
  }, [gameQuery])

  // 게임 목록 불러오기
  useEffect(() => {
    if (activeTab !== 'games') return

    let cancelled = false
    async function loadGames() {
      setGameLoading(true)
      let query = supabase
        .from('rank_games')
        .select('id,name,description,image_url,created_at,likes_count,play_count')

      if (debouncedGameQuery.trim()) {
        const value = `%${debouncedGameQuery.trim()}%`
        query = query.or(`name.ilike.${value},description.ilike.${value}`)
      }

      const plan = SORT_OPTIONS.find((item) => item.key === gameSort) || SORT_OPTIONS[0]
      plan.orders.forEach((order) => {
        query = query.order(order.column, { ascending: order.asc })
      })

      query = query.limit(40)

      const { data, error } = await query
      if (cancelled) return

      if (error) {
        console.error(error)
        setGameRows([])
      } else {
        setGameRows(data || [])
      }
      setGameLoading(false)
    }

    loadGames()

    return () => {
      cancelled = true
    }
  }, [activeTab, debouncedGameQuery, gameSort])

  // 선택한 게임 상세 불러오기
  useEffect(() => {
    if (!selectedGame) return

    let cancelled = false
    async function loadDetail() {
      setDetailLoading(true)
      setRoleChoice('')

      const [rolesResult, participantsResult] = await Promise.all([
        supabase.from('rank_game_roles').select('*').eq('game_id', selectedGame.id),
        supabase.from('rank_participants').select('*').eq('game_id', selectedGame.id),
      ])

      if (cancelled) return

      if (rolesResult.error) {
        console.error(rolesResult.error)
        setGameRoles([])
      } else {
        setGameRoles(rolesResult.data || [])
      }

      if (participantsResult.error) {
        console.error(participantsResult.error)
        setParticipants([])
      } else {
        setParticipants(participantsResult.data || [])
      }

      setDetailLoading(false)
    }

    loadDetail()

    return () => {
      cancelled = true
    }
  }, [selectedGame])

  const alerts = useMemo(
    () => [
      {
        id: 'notice-1',
        title: '랭킹 시즌 업데이트',
        body: '새로운 시즌이 시작되었습니다. 참여 가능한 게임을 확인하고 바로 입장해 보세요.',
        created_at: new Date().toLocaleString(),
      },
      {
        id: 'notice-2',
        title: '시스템 점검 안내',
        body: '이번 주말 오전 3시에는 짧은 점검이 예정되어 있습니다. 점검 시간 동안은 실시간 매칭이 제한됩니다.',
        created_at: new Date(Date.now() - 3600 * 1000).toLocaleString(),
      },
    ],
    [],
  )

  const roleSlots = useMemo(() => {
    const map = new Map()
    gameRoles.forEach((role) => {
      const occupied = participants.filter((p) => (p.role || '') === role.name).length
      map.set(role.name, { capacity: role.slot_count ?? 1, occupied })
    })
    return map
  }, [gameRoles, participants])

  const renderChat = () => (
    <div
      style={{
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        borderRadius: 24,
        boxShadow: '0 28px 60px -46px rgba(15, 23, 42, 0.55)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 12, alignItems: 'center' }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e5e7eb' }} />
        )}
        <div style={{ display: 'grid' }}>
          <strong style={{ color: '#0f172a' }}>{displayName}</strong>
          <span style={{ fontSize: 12, color: '#64748b' }}>공용 채팅에 참여 중</span>
        </div>
      </div>
      <div ref={listRef} style={{ flex: '1 1 auto', padding: 14, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 10, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
            {m.avatar_url ? (
              <img src={m.avatar_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', marginTop: 2 }} />
            ) : (
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#e5e7eb', marginTop: 2 }} />
            )}
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{m.username}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(m.created_at).toLocaleTimeString()}</span>
              </div>
              <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: 14, borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
          placeholder="메시지를 입력하세요…"
          style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}
        />
        <button
          onClick={send}
          style={{
            padding: '12px 18px',
            borderRadius: 12,
            background: '#2563eb',
            color: '#fff',
            fontWeight: 700,
            border: 'none',
          }}
        >
          보내기
        </button>
      </div>
    </div>
  )

  const renderGames = () => (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 24,
        boxShadow: '0 28px 60px -46px rgba(15, 23, 42, 0.55)',
        padding: 18,
        display: 'grid',
        gap: 14,
      }}
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
          <input
            value={gameQuery}
            onChange={(event) => setGameQuery(event.target.value)}
            placeholder="게임 이름 또는 설명 검색"
            inputMode="search"
            style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}
          />
          <select
            value={gameSort}
            onChange={(event) => setGameSort(event.target.value)}
            style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            padding: 12,
            maxHeight: '45vh',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            display: 'grid',
            gap: 10,
          }}
        >
          {gameLoading && <div style={{ padding: 12, textAlign: 'center', color: '#64748b' }}>불러오는 중…</div>}

          {!gameLoading && gameRows.length === 0 && (
            <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8' }}>조건에 맞는 게임이 없습니다.</div>
          )}

          {gameRows.map((game) => {
            const active = selectedGame?.id === game.id
            return (
              <button
                key={game.id}
                onClick={() => setSelectedGame(game)}
                style={{
                  textAlign: 'left',
                  display: 'grid',
                  gridTemplateColumns: '64px 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: 16,
                  border: active ? '2px solid #2563eb' : '1px solid #e2e8f0',
                  background: active ? 'rgba(37, 99, 235, 0.08)' : '#f9fafb',
                }}
              >
                <div style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', background: '#e2e8f0' }}>
                  {game.image_url ? (
                    <img src={game.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : null}
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <strong style={{ fontSize: 15, color: '#0f172a' }}>{game.name}</strong>
                  <span style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                    {game.description ? game.description.slice(0, 80) + (game.description.length > 80 ? '…' : '') : '설명이 없습니다.'}
                  </span>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#94a3b8' }}>
                    <span>좋아요 {game.likes_count ?? 0}</span>
                    <span>게임횟수 {game.play_count ?? 0}</span>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(game.created_at).toLocaleDateString()}</span>
              </button>
            )
          })}
        </div>
      </div>

      {selectedGame && (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 20,
            padding: 16,
            display: 'grid',
            gap: 12,
            background: '#f9fafc',
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 16, color: '#0f172a' }}>{selectedGame.name}</strong>
            <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
              {selectedGame.description || '설명이 없습니다.'}
            </p>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>역할 선택</span>
            {detailLoading && <div style={{ color: '#64748b', fontSize: 13 }}>참여 정보를 불러오는 중…</div>}
            {!detailLoading && (
              <div style={{ display: 'grid', gap: 8 }}>
                {gameRoles.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>등록된 역할이 없습니다.</div>}
                {gameRoles.map((role) => {
                  const stats = roleSlots.get(role.name) || { capacity: role.slot_count ?? 1, occupied: 0 }
                  const disabled = stats.occupied >= stats.capacity
                  const selected = roleChoice === role.name
                  return (
                    <label
                      key={role.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: selected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: disabled ? '#f1f5f9' : '#ffffff',
                        opacity: disabled ? 0.6 : 1,
                      }}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={role.name}
                        checked={selected}
                        onChange={() => !disabled && setRoleChoice(role.name)}
                        disabled={disabled}
                      />
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{role.name}</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          {`참여 ${stats.occupied}/${stats.capacity}`} · {`점수 변동 ${role.score_delta_min ?? 20} ~ ${role.score_delta_max ?? 40}`}
                        </span>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>현재 참여자</span>
            <div
              style={{
                border: '1px dashed #cbd5f5',
                borderRadius: 14,
                padding: 12,
                minHeight: 80,
                background: '#fff',
                display: 'grid',
                gap: 8,
              }}
            >
              {detailLoading && <span style={{ color: '#64748b', fontSize: 13 }}>목록을 불러오는 중…</span>}
              {!detailLoading && participants.length === 0 && (
                <span style={{ color: '#94a3b8', fontSize: 13 }}>아직 참여자가 없습니다.</span>
              )}
              {!detailLoading &&
                participants.map((entry) => (
                  <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569' }}>
                    <span>{entry.role || '미정 역할'}</span>
                    <span style={{ color: entry.status === 'alive' ? '#16a34a' : entry.status === 'eliminated' ? '#f97316' : '#6b7280' }}>
                      {entry.status}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          <button
            onClick={() => {
              if (!selectedGame) return
              const target = roleChoice ? `${selectedGame.id}?role=${encodeURIComponent(roleChoice)}` : selectedGame.id
              router.push(`/rank/${target}`)
            }}
            disabled={!selectedGame}
            style={{
              marginTop: 4,
              padding: '12px 16px',
              borderRadius: 12,
              background: '#2563eb',
              color: '#fff',
              fontWeight: 700,
              border: 'none',
            }}
          >
            선택한 역할로 입장
          </button>
        </div>
      )}
    </div>
  )

  const renderAlerts = () => (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 24,
        boxShadow: '0 28px 60px -46px rgba(15, 23, 42, 0.55)',
        padding: 18,
        display: 'grid',
        gap: 14,
      }}
    >
      {alerts.map((alert) => (
        <div
          key={alert.id}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 18,
            padding: 16,
            background: '#f8fafc',
            display: 'grid',
            gap: 6,
          }}
        >
          <strong style={{ color: '#0f172a', fontSize: 15 }}>{alert.title}</strong>
          <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{alert.body}</p>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{alert.created_at}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0f172a 0%, #1f2937 30%, #f8fafc 100%)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          margin: '0 auto',
          padding: '24px 16px 140px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <header
          style={{
            background: '#111827',
            borderRadius: 24,
            padding: '18px 20px',
            color: '#f8fafc',
            boxShadow: '0 32px 68px -42px rgba(15, 23, 42, 0.75)',
            display: 'grid',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => router.replace('/roster')}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(148, 163, 184, 0.4)',
                color: '#f8fafc',
                fontWeight: 600,
              }}
            >
              ← 로스터
            </button>
            <div style={{ display: 'grid', gap: 4 }}>
              <h1 style={{ margin: 0, fontSize: 24 }}>로비</h1>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#cbd5f5' }}>
                실시간 채팅으로 소통하고, 바로 아래 탭에서 원하는 게임을 찾아 참여하세요.
              </p>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                <a
                  style={{
                    padding: '8px 12px',
                    borderRadius: 999,
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    color: '#f8fafc',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  {item.label}
                </a>
              </Link>
            ))}
          </nav>
        </header>

        <section
          style={{
            background: '#ffffff',
            borderRadius: 20,
            padding: 10,
            display: 'flex',
            gap: 8,
            boxShadow: '0 20px 48px -40px rgba(15, 23, 42, 0.6)',
          }}
        >
          {TABS.map((tab) => {
            const active = tab.key === activeTab
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 14,
                  border: active ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  background: active ? '#eff6ff' : '#f8fafc',
                  color: active ? '#1d4ed8' : '#475569',
                  fontWeight: 600,
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </section>

        <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {activeTab === 'chat' && renderChat()}
          {activeTab === 'games' && renderGames()}
          {activeTab === 'alerts' && renderAlerts()}
        </div>
      </div>
    </div>
  )
}
