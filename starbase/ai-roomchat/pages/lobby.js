import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'

import { supabase } from '../lib/supabase'
import { withTable } from '@/lib/supabaseTables'
import RankingShowcaseSkeleton from '../components/rank/RankingShowcaseSkeleton'

const SharedChatDock = dynamic(() => import('../components/common/SharedChatDock'), {
  ssr: false,
})

const RankingShowcase = dynamic(() => import('../components/rank/RankingShowcase'), {
  ssr: false,
  loading: () => <RankingShowcaseSkeleton />,
})

function ChatOverlay({ open, onClose, heroId, command, onRequestAddFriend }) {
  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 23, 0.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        zIndex: 1100,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 22,
          border: '1px solid rgba(148, 163, 184, 0.35)',
          background: 'rgba(15, 23, 42, 0.9)',
          padding: 18,
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>공용 채팅</strong>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'rgba(15, 23, 42, 0.6)',
              color: '#e2e8f0',
              padding: '6px 10px',
              borderRadius: 999,
            }}
          >
            닫기
          </button>
        </div>
        <SharedChatDock
          height={420}
          heroId={heroId}
          command={command}
          onRequestAddFriend={onRequestAddFriend}
        />
      </div>
    </div>
  )
}

function FriendListModal({
  open,
  friendForm,
  onChangeFriendForm,
  onClose,
  onAddFriend,
  friends,
  onRemoveFriend,
  onWhisperFriend,
  onInviteFriend,
}) {
  if (!open) return null

  const hasFriends = Array.isArray(friends) && friends.length > 0

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 23, 0.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        zIndex: 1050,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 22,
          border: '1px solid rgba(148, 163, 184, 0.35)',
          background: 'rgba(15, 23, 42, 0.9)',
          padding: 18,
          display: 'grid',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>친구 목록</strong>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'rgba(15, 23, 42, 0.6)',
              color: '#e2e8f0',
              padding: '6px 10px',
              borderRadius: 999,
            }}
          >
            닫기
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <input
            value={friendForm.heroId}
            onChange={(event) =>
              onChangeFriendForm((prev) => ({ ...prev, heroId: event.target.value }))
            }
            placeholder="캐릭터 ID"
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.65)',
              color: '#e2e8f0',
            }}
          />
          <input
            value={friendForm.heroName}
            onChange={(event) =>
              onChangeFriendForm((prev) => ({ ...prev, heroName: event.target.value }))
            }
            placeholder="닉네임 (선택)"
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.65)',
              color: '#e2e8f0',
            }}
          />
          <button
            type="button"
            onClick={onAddFriend}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: 'none',
              background: '#38bdf8',
              color: '#020617',
              fontWeight: 700,
            }}
          >
            친구 추가
          </button>
        </div>

        <div
          style={{
            borderRadius: 18,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.55)',
            padding: 14,
            maxHeight: '45vh',
            overflowY: 'auto',
            display: 'grid',
            gap: 10,
          }}
        >
          {hasFriends
            ? friends.map((friend) => {
                const displayName = friend.heroName || '이름 없는 영웅'
                return (
                  <div
                    key={friend.heroId}
                    style={{
                      display: 'grid',
                      gap: 6,
                      padding: '10px 12px',
                      borderRadius: 14,
                      background: 'rgba(15, 23, 42, 0.65)',
                      border: '1px solid rgba(148, 163, 184, 0.35)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{displayName}</strong>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>ID: {friend.heroId}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveFriend(friend.heroId)}
                        style={{
                          border: 'none',
                          background: 'rgba(30, 41, 59, 0.65)',
                          color: '#f87171',
                          padding: '6px 10px',
                          borderRadius: 999,
                        }}
                      >
                        삭제
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => onWhisperFriend(friend)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: 12,
                          border: '1px solid rgba(56, 189, 248, 0.45)',
                          background: 'rgba(14, 165, 233, 0.18)',
                          color: '#bae6fd',
                          fontWeight: 600,
                        }}
                      >
                        귓속말
                      </button>
                      <button
                        type="button"
                        onClick={() => onInviteFriend(friend)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: 12,
                          border: 'none',
                          background: '#38bdf8',
                          color: '#020617',
                          fontWeight: 700,
                        }}
                      >
                        게임 초대
                      </button>
                    </div>
                  </div>
                )
              })
            : (
                <span style={{ color: '#94a3b8', fontSize: 13 }}>등록된 친구가 없습니다.</span>
              )}
        </div>
      </div>
    </div>
  )
}

const NAV_ITEMS = [
  { label: '게임 제작', href: '/maker' },
  { label: '게임 등록', href: '/rank/new' },
]

const TABS = [
  { key: 'games', label: '게임 찾기' },
  { key: 'rankings', label: '게임별·전체 랭킹' },
  { key: 'notices', label: '공지' },
]

const SORT_OPTIONS = [
  { key: 'latest', label: '최신순', orders: [{ column: 'created_at', asc: false }] },
  { key: 'likes', label: '좋아요순', orders: [{ column: 'likes_count', asc: false }, { column: 'created_at', asc: false }] },
  { key: 'plays', label: '게임횟수순', orders: [{ column: 'play_count', asc: false }, { column: 'created_at', asc: false }] },
]

const FRIEND_STORAGE_KEY = 'starbase_lobby_friends'

export default function Lobby() {
  const router = useRouter()
  const { heroId } = router.query

  const [activeTab, setActiveTab] = useState('games')
  const [chatOpen, setChatOpen] = useState(false)
  const [friendOpen, setFriendOpen] = useState(false)
  const [chatCommand, setChatCommand] = useState(null)
  const [friends, setFriends] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem(FRIEND_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      return []
    }
  })
  const [friendForm, setFriendForm] = useState({ heroId: '', heroName: '' })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(FRIEND_STORAGE_KEY, JSON.stringify(friends))
  }, [friends])

  const [user, setUser] = useState(null)
  const [myHero, setMyHero] = useState(null)

  useEffect(() => {
    let alive = true
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) {
        router.replace('/')
        return
      }
      setUser(user)

      let resolvedHeroId = null
      if (typeof heroId === 'string' && heroId) {
        resolvedHeroId = heroId
      } else if (typeof window !== 'undefined') {
        resolvedHeroId = window.localStorage.getItem('selectedHeroId')
      }

      if (resolvedHeroId) {
        const { data } = await withTable(supabase, 'heroes', (table) =>
          supabase
            .from(table)
            .select('id,name,image_url,description')
            .eq('id', resolvedHeroId)
            .maybeSingle(),
        )
        if (!alive) return
        if (data) {
          setMyHero(data)
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('selectedHeroId', data.id)
          }
        } else {
          setMyHero(null)
        }
      } else {
        setMyHero(null)
      }
    }
    init()
    return () => {
      alive = false
    }
  }, [heroId, router])

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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedGameQuery(gameQuery), 250)
    return () => clearTimeout(timer)
  }, [gameQuery])

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

      query = query.limit(50)

      const { data, error } = await query
      if (cancelled) return

      if (error) {
        console.warn('game list fetch failed, attempting fallback:', error.message)
        try {
          const params = new URLSearchParams()
          if (debouncedGameQuery.trim()) params.set('q', debouncedGameQuery.trim())
          params.set('sort', gameSort)
          params.set('limit', '50')
          const res = await fetch(`/api/rank/list-games?${params.toString()}`)
          if (!res.ok) throw new Error(await res.text())
          const payload = await res.json()
          setGameRows(Array.isArray(payload.data) ? payload.data : [])
        } catch (fallbackError) {
          console.error('fallback game list fetch failed:', fallbackError)
          setGameRows([])
        }
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

  async function fetchGameDetail(gameId) {
    const [rolesResult, participantsResult] = await Promise.all([
      withTable(supabase, 'rank_game_roles', (table) =>
        supabase.from(table).select('*').eq('game_id', gameId),
      ),
      withTable(supabase, 'rank_participants', (table) =>
        supabase.from(table).select('*').eq('game_id', gameId),
      ),
    ])

    const rolesError = rolesResult.error
    const participantsError = participantsResult.error

    const baseRoles = rolesResult.data || []
    const baseParticipants = participantsResult.data || []

    let needsFallback = !!(rolesError || participantsError)

    if (!needsFallback) {
      const heroIds = Array.from(new Set(baseParticipants.map((row) => row.hero_id).filter(Boolean)))

      if (heroIds.length === 0) {
        return { roles: baseRoles, participants: baseParticipants }
      }

      const { data: heroRows, error: heroError } = await withTable(
        supabase,
        'heroes',
        (table) =>
          supabase
            .from(table)
            .select('id,name,image_url,description,owner_id,ability1,ability2,ability3,ability4')
            .in('id', heroIds),
      )

      if (!heroError) {
        const lookup = new Map((heroRows || []).map((hero) => [hero.id, hero]))
        return {
          roles: baseRoles,
          participants: baseParticipants.map((row) => ({
            ...row,
            hero: lookup.get(row.hero_id) || null,
          })),
        }
      }

      console.warn('rank lobby: hero lookup failed, falling back to API:', heroError?.message)
      needsFallback = true
    }

    try {
      const res = await fetch(`/api/rank/game-detail?gameId=${encodeURIComponent(gameId)}`)
      if (!res.ok) throw new Error(await res.text())
      const payload = await res.json()
      return {
        roles: Array.isArray(payload.roles) ? payload.roles : baseRoles,
        participants: Array.isArray(payload.participants) ? payload.participants : baseParticipants,
      }
    } catch (fallbackError) {
      console.error('fallback game detail fetch failed:', fallbackError)
      return { roles: baseRoles, participants: baseParticipants }
    }
  }

  useEffect(() => {
    if (!selectedGame) return

    let cancelled = false
    async function loadDetail() {
      setDetailLoading(true)
      const detail = await fetchGameDetail(selectedGame.id)
      if (cancelled) return
      setGameRoles(detail.roles)
      setParticipants(detail.participants)
      if (!roleChoice && detail.roles.length) {
        setRoleChoice(detail.roles[0].name)
      }
      setDetailLoading(false)
    }

    loadDetail()

    return () => {
      cancelled = true
    }
  }, [selectedGame, roleChoice])

  const roleSummary = useMemo(() => {
    if (!gameRoles.length) return []
    return gameRoles.map((role) => {
      const count = participants.filter((row) => (row.role || '') === role.name).length
      return {
        id: role.id,
        name: role.name,
        occupied: count,
        scoreMin: role.score_delta_min ?? 20,
        scoreMax: role.score_delta_max ?? 40,
      }
    })
  }, [gameRoles, participants])

  const notices = useMemo(
    () => [
      {
        id: 'notice-1',
        title: '시즌 업데이트 안내',
        body: '새로운 시즌과 함께 보상 구조가 개편되었습니다. 랭킹 탭에서 주요 변화를 확인하세요.',
        created_at: new Date().toLocaleString(),
      },
      {
        id: 'notice-2',
        title: '친구 초대 기능 추가',
        body: '친구 목록에서 귓속말을 보내거나 실시간 매칭에 초대할 수 있습니다. 함께 플레이해 보세요!',
        created_at: new Date(Date.now() - 3600 * 1000).toLocaleString(),
      },
      {
        id: 'notice-3',
        title: '점검 예정',
        body: '이번 주말 새벽 2시부터 30분간 서버 점검이 예정되어 있습니다. 점검 중에는 게임 찾기 기능이 제한됩니다.',
        created_at: new Date(Date.now() - 86400 * 1000).toLocaleString(),
      },
    ],
    [],
  )

  const sortedFriends = useMemo(() => {
    const list = [...friends]
    list.sort((a, b) => (a.heroName || '').localeCompare(b.heroName || '', 'ko'))
    return list
  }, [friends])

  function openChat(command = null) {
    setChatCommand(command)
    setChatOpen(true)
    setFriendOpen(false)
  }

  function handleWhisper({ heroId, heroName }) {
    if (!heroId) return
    openChat({ type: 'whisper', heroId, prefill: heroName ? `@${heroName} ` : '' })
  }

  function handleInvite({ heroId, heroName, gameId }) {
    const name = heroName || '플레이어'
    alert(`${name}에게 초대 알림을 전송했습니다.`)
    if (gameId) {
      // 실시간 초대 연동 지점
    }
  }

  const handleFriendWhisper = (friend) => {
    if (!friend?.heroId) return
    handleWhisper({ heroId: friend.heroId, heroName: friend.heroName })
    setFriendOpen(false)
  }

  const handleFriendInvite = (friend) => {
    if (!friend?.heroId) return
    handleInvite({ heroId: friend.heroId, heroName: friend.heroName, gameId: selectedGame?.id })
  }

  function handleChatAddFriend(friend) {
    if (!friend?.heroId) return
    setFriends((prev) => {
      if (prev.some((entry) => entry.heroId === friend.heroId)) return prev
      return [
        ...prev,
        { heroId: friend.heroId, heroName: friend.heroName || '이름 없는 영웅' },
      ]
    })
  }

  function handleAddFriend() {
    const id = friendForm.heroId.trim()
    const name = friendForm.heroName.trim() || '이름 없는 영웅'
    if (!id) {
      alert('친구로 추가할 캐릭터 ID를 입력하세요.')
      return
    }
    setFriends((prev) => {
      if (prev.some((entry) => entry.heroId === id)) return prev
      return [...prev, { heroId: id, heroName: name }]
    })
    setFriendForm({ heroId: '', heroName: '' })
  }

  function handleRemoveFriend(heroId) {
    setFriends((prev) => prev.filter((entry) => entry.heroId !== heroId))
  }

  async function joinGame() {
    if (!selectedGame) return
    if (!myHero) {
      alert('내 캐릭터를 먼저 선택하세요. 로스터에서 캐릭터를 선택하면 자동으로 반영됩니다.')
      return
    }
    const roleName = roleChoice || (gameRoles[0]?.name || '참가자')
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      alert('로그인이 필요합니다.')
      return
    }

    const payload = {
      game_id: selectedGame.id,
      hero_id: myHero.id,
      owner_id: user.id,
      role: roleName,
      score: 1000,
    }

    const { error } = await withTable(supabase, 'rank_participants', (table) =>
      supabase.from(table).insert(payload, { ignoreDuplicates: true }),
    )
    if (error) {
      console.warn('joinGame primary insert failed, attempting fallback:', error.message)
      try {
        const res = await fetch('/api/rank/join-game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || 'fallback join failed')
        }
      } catch (fallbackErr) {
        console.error('fallback join failed:', fallbackErr)
        alert('참여 실패: ' + error.message)
        return
      }
    }

    const detail = await fetchGameDetail(selectedGame.id)
    setGameRoles(detail.roles)
    setParticipants(detail.participants)
    setRoleChoice(roleName)
    alert('참여가 등록되었습니다.')
  }

  function startSelectedGame() {
    if (!selectedGame) return
    router.push(`/rank/${selectedGame.id}/start`)
  }
  function renderGames() {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div
          style={{
            display: 'grid',
            gap: 12,
            borderRadius: 24,
            padding: 16,
            background: '#0f172a',
            boxShadow: '0 24px 60px -48px rgba(15, 23, 42, 0.75)',
          }}
        >
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 140px', alignItems: 'center' }}>
            <input
              value={gameQuery}
              onChange={(event) => setGameQuery(event.target.value)}
              placeholder="게임 이름 또는 설명 검색"
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid rgba(148, 163, 184, 0.45)',
                background: 'rgba(15, 23, 42, 0.72)',
                color: '#e2e8f0',
              }}
            />
            <select
              value={gameSort}
              onChange={(event) => setGameSort(event.target.value)}
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid rgba(148, 163, 184, 0.45)',
                background: 'rgba(15, 23, 42, 0.72)',
                color: '#e2e8f0',
              }}
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
              display: 'grid',
              gap: 10,
              maxHeight: '40vh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {gameLoading && (
              <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>불러오는 중…</div>
            )}
            {!gameLoading && gameRows.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>조건에 맞는 게임이 없습니다.</div>
            )}
            {gameRows.map((game) => {
              const active = selectedGame?.id === game.id
              return (
                <button
                  key={game.id}
                  onClick={() => setSelectedGame(game)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '72px 1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: 18,
                    border: active ? '2px solid rgba(56, 189, 248, 0.65)' : '1px solid rgba(148, 163, 184, 0.35)',
                    background: active ? 'rgba(8, 47, 73, 0.65)' : 'rgba(15, 23, 42, 0.55)',
                    color: '#e2e8f0',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 18,
                      overflow: 'hidden',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(148, 163, 184, 0.35)',
                    }}
                  >
                    {game.image_url ? (
                      <img
                        src={game.image_url}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 28,
                        }}
                      >
                        🎮
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <strong style={{ fontSize: 15 }}>{game.name}</strong>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      {game.description
                        ? game.description.slice(0, 80) + (game.description.length > 80 ? '…' : '')
                        : '설명이 없습니다.'}
                    </span>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#94a3b8' }}>
                      <span>좋아요 {game.likes_count ?? 0}</span>
                      <span>게임횟수 {game.play_count ?? 0}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    {new Date(game.created_at).toLocaleDateString()}
                  </span>
                </button>
              )
            })}
        </div>
      </div>

      {selectedGame ? (
        <article
          style={{
            borderRadius: 28,
            overflow: 'hidden',
            background: '#020617',
            color: '#e2e8f0',
            boxShadow: '0 36px 80px -52px rgba(8, 47, 73, 0.85)',
          }}
        >
          <div
            style={{
              position: 'relative',
              height: 220,
              background: 'radial-gradient(circle at top, rgba(59, 130, 246, 0.45), rgba(15, 23, 42, 0.85))',
            }}
          >
            {selectedGame.image_url ? (
              <img
                src={selectedGame.image_url}
                alt="게임 이미지"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: 'brightness(0.75)',
                }}
              />
            ) : null}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.15) 0%, rgba(2, 6, 23, 0.85) 100%)',
                display: 'flex',
                alignItems: 'flex-end',
              }}
            >
              <div style={{ padding: '20px 24px', display: 'grid', gap: 10 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>추천 게임</span>
                <h2 style={{ margin: 0, fontSize: 26 }}>{selectedGame.name}</h2>
                <p style={{ margin: 0, fontSize: 13, color: '#cbd5f5' }}>
                  {selectedGame.description || '등록된 설명이 없습니다.'}
                </p>
              </div>
            </div>
          </div>

          <div style={{ padding: '20px 24px', display: 'grid', gap: 18 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderRadius: 18,
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: 'rgba(15, 23, 42, 0.5)',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                  }}
                >
                  {myHero?.image_url ? (
                    <img
                      src={myHero.image_url}
                      alt="내 캐릭터"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 26,
                      }}
                    >
                      🛡️
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <strong>{myHero?.name || '내 캐릭터 없음'}</strong>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    {myHero ? '선택한 캐릭터로 참여합니다.' : '로스터에서 캐릭터를 선택하면 표시됩니다.'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/roster')}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  border: '1px solid rgba(56, 189, 248, 0.55)',
                  background: 'rgba(14, 165, 233, 0.18)',
                  color: '#e0f2fe',
                  fontWeight: 700,
                }}
              >
                로스터 이동
              </button>
            </div>

            {gameRoles.length ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <span style={{ fontWeight: 700 }}>역할 선택</span>
                <div style={{ display: 'grid', gap: 8 }}>
                  {roleSummary.map((role) => {
                    const selected = roleChoice === role.name
                    return (
                      <label
                        key={role.id || role.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 16px',
                          borderRadius: 16,
                          border: selected ? '2px solid rgba(56, 189, 248, 0.65)' : '1px solid rgba(148, 163, 184, 0.35)',
                          background: 'rgba(15, 23, 42, 0.65)',
                        }}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={role.name}
                          checked={selected}
                          onChange={() => setRoleChoice(role.name)}
                          style={{ accentColor: '#38bdf8' }}
                        />
                        <div style={{ display: 'grid', gap: 4 }}>
                          <span style={{ fontWeight: 600 }}>{role.name}</span>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>
                            참여 {role.occupied}명 · 점수 변동 {role.scoreMin} ~ {role.scoreMax}
                          </span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: 12 }}>
              <span style={{ fontWeight: 700 }}>현재 참가자</span>
              <div
                style={{
                  borderRadius: 18,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(15, 23, 42, 0.6)',
                  padding: 16,
                  display: 'grid',
                  gap: 10,
                }}
              >
                {detailLoading ? (
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>참가자 정보를 불러오는 중…</span>
                ) : participants.length === 0 ? (
                  <span style={{ color: '#64748b', fontSize: 13 }}>아직 참가자가 없습니다.</span>
                ) : (
                  participants.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        color: '#e2e8f0',
                      }}
                    >
                      <span>{entry.role || '미정 역할'}</span>
                      <span style={{ color: entry.status === 'alive' ? '#4ade80' : '#94a3b8' }}>
                        {entry.status || '대기'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <button
                type="button"
                onClick={joinGame}
                style={{
                  padding: '12px 20px',
                  borderRadius: 999,
                  border: '1px solid rgba(56, 189, 248, 0.55)',
                  background: 'rgba(14, 165, 233, 0.18)',
                  color: '#e0f2fe',
                  fontWeight: 700,
                }}
              >
                게임 참가 신청
              </button>
              <button
                type="button"
                onClick={startSelectedGame}
                style={{
                  padding: '12px 22px',
                  borderRadius: 999,
                  border: 'none',
                  background: '#38bdf8',
                  color: '#020617',
                  fontWeight: 800,
                }}
              >
                게임 시작
              </button>
            </div>
          </div>
        </article>
      ) : (
        <div
          style={{
            padding: 24,
            borderRadius: 28,
            border: '1px dashed rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.45)',
            color: '#94a3b8',
            textAlign: 'center',
          }}
        >
          게임을 선택하면 상세 정보와 참여 옵션이 표시됩니다.
        </div>
      )}
      </div>
    )
  }
  function renderRankings() {
    return (
      <RankingShowcase
        onWhisper={({ heroId, heroName }) => handleWhisper({ heroId, heroName })}
        onInvite={handleInvite}
      />
    )
  }

  function renderNotices() {
    return (
      <div
        style={{
          borderRadius: 24,
          padding: 20,
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(148, 163, 184, 0.35)',
          color: '#e2e8f0',
          display: 'grid',
          gap: 14,
        }}
      >
        {notices.map((notice) => (
          <article
            key={notice.id}
            style={{
              borderRadius: 18,
              padding: 16,
              background: 'rgba(15, 23, 42, 0.45)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
            }}
          >
            <strong style={{ fontSize: 15 }}>{notice.title}</strong>
            <p style={{ margin: '8px 0 12px', fontSize: 13, color: '#cbd5f5', lineHeight: 1.6 }}>{notice.body}</p>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{notice.created_at}</span>
          </article>
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 20% -10%, rgba(59, 130, 246, 0.45), rgba(2, 6, 23, 0.95))',
        color: '#e2e8f0',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          margin: '0 auto',
          padding: '32px 18px 160px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <header
          style={{
            borderRadius: 28,
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            padding: '20px 22px',
            display: 'grid',
            gap: 16,
            boxShadow: '0 40px 80px -60px rgba(15, 23, 42, 0.95)',
          }}
        >
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => router.replace('/roster')}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(15, 23, 42, 0.6)',
                color: '#e2e8f0',
                fontWeight: 600,
              }}
            >
              ← 로스터
            </button>
            <div style={{ display: 'grid', gap: 6 }}>
              <h1 style={{ margin: 0, fontSize: 28 }}>로비</h1>
              <p style={{ margin: 0, fontSize: 13, color: '#cbd5f5', lineHeight: 1.6 }}>
                게임 제작·등록 페이지로 이동하거나, 아래 탭에서 원하는 게임을 찾아 바로 시작해 보세요.
              </p>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href}>
                <a
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    color: '#e2e8f0',
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
            background: 'rgba(15, 23, 42, 0.8)',
            borderRadius: 20,
            padding: 10,
            display: 'flex',
            gap: 8,
            boxShadow: '0 20px 48px -40px rgba(15, 23, 42, 0.9)',
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
                  border: active ? '1px solid rgba(56, 189, 248, 0.65)' : '1px solid rgba(148, 163, 184, 0.35)',
                  background: active ? 'rgba(8, 47, 73, 0.7)' : 'rgba(15, 23, 42, 0.6)',
                  color: active ? '#38bdf8' : '#cbd5f5',
                  fontWeight: 600,
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {activeTab === 'games' && renderGames()}
          {activeTab === 'rankings' && renderRankings()}
          {activeTab === 'notices' && renderNotices()}
        </div>
      </div>

      <ChatOverlay
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        heroId={myHero?.id || null}
        command={chatCommand}
        onRequestAddFriend={handleChatAddFriend}
      />

      <FriendListModal
        open={friendOpen}
        friendForm={friendForm}
        onChangeFriendForm={setFriendForm}
        onClose={() => setFriendOpen(false)}
        onAddFriend={handleAddFriend}
        friends={sortedFriends}
        onRemoveFriend={handleRemoveFriend}
        onWhisperFriend={handleFriendWhisper}
        onInviteFriend={handleFriendInvite}
      />

      <div
        style={{
          position: 'fixed',
          bottom: 28,
          right: 24,
          display: 'grid',
          gap: 12,
          zIndex: 1000,
        }}
      >
        <button
          type="button"
          onClick={() => setFriendOpen(true)}
          style={{
            width: 54,
            height: 54,
            borderRadius: '50%',
            border: '1px solid rgba(148, 163, 184, 0.45)',
            background: 'rgba(15, 23, 42, 0.8)',
            color: '#e2e8f0',
            fontWeight: 700,
          }}
        >
          🤝
        </button>
        <button
          type="button"
          onClick={() => openChat(null)}
          style={{
            width: 54,
            height: 54,
            borderRadius: '50%',
            border: 'none',
            background: '#38bdf8',
            color: '#020617',
            fontWeight: 800,
          }}
        >
          💬
        </button>
      </div>
    </div>
  )
}

// 
