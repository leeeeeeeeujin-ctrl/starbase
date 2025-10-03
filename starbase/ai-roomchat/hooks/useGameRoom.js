'use client'

// hooks/useGameRoom.js
import { useCallback, useEffect, useMemo, useState } from 'react'

import { withTable } from '@/lib/supabaseTables'

import { supabase } from '../lib/supabase'

async function fetchParticipantsWithHeroes(gameId) {
  const {
    data: participantsData,
    error: participantError,
  } = await withTable(supabase, 'rank_participants', (table) =>
    supabase
      .from(table)
      .select(
        'id, game_id, hero_id, hero_ids, owner_id, role, score, rating, battles, win_rate, status, created_at'
      )
      .eq('game_id', gameId)
      .order('score', { ascending: false })
  )

  if (participantError) throw participantError

  const participants = participantsData || []
  const heroIdSet = new Set()
  participants.forEach((participant) => {
    const direct = participant?.hero_id
    if (direct) {
      heroIdSet.add(direct)
      return
    }
    const heroArray = Array.isArray(participant?.hero_ids) ? participant.hero_ids : []
    heroArray.forEach((value) => {
      if (value) {
        heroIdSet.add(value)
      }
    })
  })
  const heroIds = Array.from(heroIdSet)

  if (!heroIds.length) {
    return participants.map((p) => ({ ...p, hero: null }))
  }

  const { data: heroesData, error: heroError } = await withTable(
    supabase,
    'heroes',
    (table) =>
      supabase
        .from(table)
        .select(
          'id, name, image_url, background_url, description, owner_id, ability1, ability2, ability3, ability4, bgm_url, bgm_duration_seconds'
        )
        .in('id', heroIds)
  )

  if (heroError) throw heroError

  const heroesById = new Map((heroesData || []).map((hero) => [hero.id, hero]))

  return participants.map((participant) => ({
    ...participant,
    hero: heroesById.get(participant.hero_id) || null,
  }))
}

async function fetchRoleMetadata(gameId) {
  if (!gameId) return []
  const { data, error } = await withTable(supabase, 'rank_game_roles', (table) =>
    supabase
      .from(table)
      .select('name, slot_count, active')
      .eq('game_id', gameId),
  )
  if (error) throw error
  return Array.isArray(data) ? data : []
}

async function fetchActiveSlotCounts(gameId) {
  if (!gameId) return new Map()
  const { data, error } = await withTable(supabase, 'rank_game_slots', (table) =>
    supabase
      .from(table)
      .select('role, active')
      .eq('game_id', gameId),
  )
  if (error) throw error
  const map = new Map()
  ;(Array.isArray(data) ? data : []).forEach((slot) => {
    if (slot?.active === false) return
    const name = typeof slot?.role === 'string' ? slot.role.trim() : ''
    if (!name) return
    map.set(name, (map.get(name) || 0) + 1)
  })
  return map
}

async function fetchSlotDetails(gameId) {
  if (!gameId) return []
  const { data, error } = await withTable(supabase, 'rank_game_slots', (table) =>
    supabase
      .from(table)
      .select('id, slot_index, role, active, hero_id, hero_owner_id, updated_at')
      .eq('game_id', gameId)
      .order('slot_index', { ascending: true }),
  )
  if (error) throw error
  return Array.isArray(data) ? data : []
}

function normalizeRoles({ gameRoles, roleRows, slotCounts }) {
  const byName = new Map()

  ;(Array.isArray(roleRows) ? roleRows : []).forEach((row) => {
    const rawName = typeof row?.name === 'string' ? row.name.trim() : ''
    if (!rawName) return
    const rawCount = Number(row?.slot_count ?? row?.slotCount)
    const slotCount = Number.isFinite(rawCount) && rawCount >= 0 ? rawCount : null
    byName.set(rawName, {
      name: rawName,
      slot_count: slotCount ?? (slotCounts?.get(rawName) ?? null),
    })
  })

  if (slotCounts instanceof Map) {
    slotCounts.forEach((count, name) => {
      if (!name) return
      const normalizedCount = Number.isFinite(Number(count)) ? Number(count) : null
      if (byName.has(name)) {
        const current = byName.get(name)
        if (normalizedCount != null) {
          current.slot_count = normalizedCount
        }
      } else {
        byName.set(name, { name, slot_count: normalizedCount })
      }
    })
  }

  if (!byName.size && Array.isArray(gameRoles) && gameRoles.length) {
    gameRoles.forEach((raw) => {
      const name = typeof raw === 'string' ? raw.trim() : ''
      if (!name) return
      const fallbackCount = slotCounts instanceof Map ? slotCounts.get(name) : null
      const normalizedCount = Number.isFinite(Number(fallbackCount))
        ? Number(fallbackCount)
        : null
      if (!byName.has(name)) {
        byName.set(name, { name, slot_count: normalizedCount })
      }
    })
  }

  if (!byName.size) {
    return []
  }

  return Array.from(byName.values())
}

function computeRequiredSlots(roleList, slotCounts) {
  if (Array.isArray(roleList) && roleList.length) {
    const total = roleList.reduce((acc, role) => {
      const raw = Number(role?.slot_count ?? role?.slotCount)
      if (Number.isFinite(raw) && raw > 0) {
        return acc + raw
      }
      return acc
    }, 0)
    if (total > 0) {
      return total
    }
  }

  if (slotCounts instanceof Map && slotCounts.size) {
    let sum = 0
    slotCounts.forEach((count) => {
      const raw = Number(count)
      if (Number.isFinite(raw) && raw > 0) {
        sum += raw
      }
    })
    return sum
  }

  return 0
}

async function resolveStoredHero() {
  if (typeof window === 'undefined') return null
  const heroId = window.localStorage.getItem('selectedHeroId')
  if (!heroId) return null

  const { data, error } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select(
        'id, name, image_url, background_url, description, owner_id, ability1, ability2, ability3, ability4, bgm_url, bgm_duration_seconds'
      )
      .eq('id', heroId)
      .maybeSingle()
  )

  if (error) return null
  return data || null
}

async function fetchRecentBattles(gameId) {
  const { data, error } = await withTable(supabase, 'rank_battles', (table) =>
    supabase
      .from(table)
      .select(
        'id, game_id, attacker_owner_id, attacker_hero_ids, defender_owner_id, defender_hero_ids, result, score_delta, created_at'
      )
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })
      .limit(40)
  )

  if (error) throw error
  return data || []
}

async function fetchOwnSessionHistory(
  gameId,
  ownerId,
  { sessionLimit = 3, turnLimit = 40 } = {},
) {
  if (!gameId || !ownerId) {
    return []
  }

  const { data: sessionRows, error: sessionError } = await withTable(
    supabase,
    'rank_sessions',
    (table) =>
      supabase
        .from(table)
        .select('id, status, turn, created_at, updated_at')
        .eq('game_id', gameId)
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(sessionLimit),
  )

  if (sessionError) throw sessionError

  const sessions = Array.isArray(sessionRows) ? sessionRows : []
  if (!sessions.length) {
    return []
  }

  const sessionIds = sessions.map((row) => row?.id).filter(Boolean)
  if (!sessionIds.length) {
    return sessions.map((session) => ({
      sessionId: session.id,
      sessionStatus: session.status || 'active',
      sessionCreatedAt: session.created_at || null,
      sessionUpdatedAt: session.updated_at || null,
      turnCount: 0,
      displayedTurnCount: 0,
      publicTurns: [],
      hiddenCount: 0,
      hasMore: false,
    }))
  }

  const { data: turnRows, error: turnError } = await withTable(
    supabase,
    'rank_turns',
    (table) =>
      supabase
        .from(table)
        .select('id, session_id, idx, role, public, is_visible, content, summary_payload, created_at')
        .in('session_id', sessionIds)
        .order('session_id', { ascending: false })
        .order('idx', { ascending: true }),
  )

  if (turnError) throw turnError

  const grouped = new Map()
  ;(Array.isArray(turnRows) ? turnRows : []).forEach((turn) => {
    if (!turn?.session_id) return
    const key = turn.session_id
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key).push(turn)
  })

  const perSessionLimit = Number.isFinite(Number(turnLimit)) && Number(turnLimit) > 0
    ? Number(turnLimit)
    : 40

  return sessions.map((session) => {
    const allTurns = grouped.get(session.id) || []
    const sorted = [...allTurns].sort((a, b) => {
      const left = Number(a?.idx)
      const right = Number(b?.idx)
      if (Number.isFinite(left) && Number.isFinite(right)) {
        return left - right
      }
      return 0
    })
    const shareableTurns = sorted.filter(
      (turn) => turn?.public !== false && turn?.is_visible !== false,
    )
    const limitedShareable =
      perSessionLimit > 0 ? shareableTurns.slice(-perSessionLimit) : shareableTurns
    const hiddenTurns = sorted.filter((turn) => turn?.public === false)
    const suppressedTurns = sorted.filter(
      (turn) => turn?.public !== false && turn?.is_visible === false,
    )
    const latestSummarySource = [...sorted].reverse().find((turn) => turn?.summary_payload)

    return {
      sessionId: session.id,
      sessionStatus: session.status || 'active',
      sessionCreatedAt: session.created_at || null,
      sessionUpdatedAt: session.updated_at || null,
      turnCount: sorted.length,
      displayedTurnCount: limitedShareable.length,
      publicTurnCount: shareableTurns.length,
      publicTurns: limitedShareable,
      hiddenCount: hiddenTurns.length,
      suppressedCount: suppressedTurns.length,
      trimmedCount: Math.max(shareableTurns.length - limitedShareable.length, 0),
      latestSummary: latestSummarySource?.summary_payload || null,
      hasMore: shareableTurns.length > limitedShareable.length || sorted.length > limitedShareable.length,
    }
  })
}

async function fetchSharedSessionHistory(gameId, token, { limit = 5, turnLimit = 30 } = {}) {
  if (!gameId || !token || typeof fetch === 'undefined') {
    return []
  }

  const params = new URLSearchParams()
  params.set('gameId', gameId)
  if (Number.isFinite(Number(limit))) {
    params.set('limit', String(limit))
  }
  if (Number.isFinite(Number(turnLimit))) {
    params.set('turnLimit', String(turnLimit))
  }

  const response = await fetch(`/api/rank/sessions?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || `Failed to load shared session history (${response.status})`)
  }

  const payload = await response.json().catch(() => ({}))
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : []
  return sessions.map((session) => ({
    ...session,
    turns: Array.isArray(session.turns) ? session.turns : [],
  }))
}

export function useGameRoom(
  gameId,
  {
    onRequireLogin,
    onGameMissing,
    onDeleted,
  } = {}
) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [authToken, setAuthToken] = useState(null)
  const [game, setGame] = useState(null)
  const [roles, setRoles] = useState([])
  const [participants, setParticipants] = useState([])
  const [slots, setSlots] = useState([])
  const [myHero, setMyHero] = useState(null)
  const [recentBattles, setRecentBattles] = useState([])
  const [deleting, setDeleting] = useState(false)
  const [requiredSlots, setRequiredSlots] = useState(0)
  const [sessionHistory, setSessionHistory] = useState([])
  const [sharedSessionHistory, setSharedSessionHistory] = useState([])

  useEffect(() => {
    if (!gameId) return
    let alive = true

    const bootstrap = async () => {
      setLoading(true)
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (!alive) return
        if (authError) throw authError
        const currentUser = authData?.user || null
        if (!currentUser) {
          onRequireLogin?.()
          setLoading(false)
          return
        }
        setUser(currentUser)

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (!alive) return
        if (sessionError) {
          console.warn('세션 토큰을 가져오지 못했습니다:', sessionError)
        }
        setAuthToken(sessionData?.session?.access_token || null)

        const { data: gameData, error: gameError } = await withTable(
          supabase,
          'rank_games',
          (table) =>
            supabase
              .from(table)
              .select('*')
              .eq('id', gameId)
              .maybeSingle()
        )

        if (!alive) return
        if (gameError || !gameData) {
          onGameMissing?.()
          setLoading(false)
          return
        }

        setGame(gameData)

        let slotCounts = new Map()
        try {
          slotCounts = await fetchActiveSlotCounts(gameId)
        } catch (slotError) {
          console.warn('슬롯 정보를 불러오지 못했습니다:', slotError)
          slotCounts = new Map()
        }

        let roleRows = []
        try {
          roleRows = await fetchRoleMetadata(gameId)
        } catch (roleError) {
          console.warn('역할 메타데이터를 불러오지 못했습니다:', roleError)
          roleRows = []
        }

        const normalizedRoles = normalizeRoles({
          gameRoles: gameData.roles,
          roleRows,
          slotCounts,
        })

        let resolvedRoles = normalizedRoles

        if (!resolvedRoles.length && Array.isArray(gameData.roles) && gameData.roles.length) {
          resolvedRoles = gameData.roles
            .map((name) =>
              typeof name === 'string' && name.trim().length
                ? { name: name.trim(), slot_count: slotCounts.get(name.trim()) ?? null }
                : null,
            )
            .filter(Boolean)
        }

        if (!resolvedRoles.length) {
          resolvedRoles = [
            { name: '공격', slot_count: slotCounts.get('공격') ?? null },
            { name: '수비', slot_count: slotCounts.get('수비') ?? null },
          ]
        }

        let slotRows = []
        try {
          slotRows = await fetchSlotDetails(gameId)
        } catch (slotLoadError) {
          console.warn('슬롯 상세 정보를 불러오지 못했습니다:', slotLoadError)
          slotRows = []
        }

        setSlots(slotRows)
        setRoles(resolvedRoles)

        const activeSlotTotal = slotRows.filter((slot) => slot?.active !== false).length
        const computedRequired = activeSlotTotal > 0
          ? activeSlotTotal
          : computeRequiredSlots(resolvedRoles, slotCounts)
        setRequiredSlots(computedRequired)

        const mappedParticipants = await fetchParticipantsWithHeroes(gameId)
        if (!alive) return
        setParticipants(mappedParticipants)

        try {
          const battles = await fetchRecentBattles(gameId)
          if (!alive) return
          setRecentBattles(battles)
        } catch (battleError) {
          console.warn('최근 전투 기록을 불러오지 못했습니다:', battleError)
        }

        const storedHero = await resolveStoredHero()
        if (!alive) return
        setMyHero(storedHero)

        try {
          const historyGroups = await fetchOwnSessionHistory(gameId, currentUser.id)
          if (!alive) return
          setSessionHistory(historyGroups)
        } catch (historyError) {
          console.warn('세션 히스토리를 불러오지 못했습니다:', historyError)
        }

        if (sessionData?.session?.access_token) {
          try {
            const sharedGroups = await fetchSharedSessionHistory(
              gameId,
              sessionData.session.access_token,
            )
            if (!alive) return
            setSharedSessionHistory(sharedGroups)
          } catch (sharedError) {
            console.warn('공용 히스토리를 불러오지 못했습니다:', sharedError)
          }
        } else {
          setSharedSessionHistory([])
        }
      } catch (err) {
        console.error('게임 방 초기화 실패:', err)
      } finally {
        if (alive) setLoading(false)
      }
    }

    bootstrap()
    return () => {
      alive = false
    }
  }, [gameId, onGameMissing, onRequireLogin])

  const refreshParticipants = useCallback(async () => {
    if (!gameId) return
    try {
      const mapped = await fetchParticipantsWithHeroes(gameId)
      setParticipants(mapped)
    } catch (err) {
      console.error('참가자 갱신 실패:', err)
    }
  }, [gameId])

  const refreshBattles = useCallback(async () => {
    if (!gameId) return
    try {
      const battles = await fetchRecentBattles(gameId)
      setRecentBattles(battles)
    } catch (err) {
      console.error('전투 기록 갱신 실패:', err)
    }
  }, [gameId])

  const refreshSlots = useCallback(async () => {
    if (!gameId) return []
    try {
      const next = await fetchSlotDetails(gameId)
      setSlots(next)
      return next
    } catch (err) {
      console.error('슬롯 정보 갱신 실패:', err)
      return null
    }
  }, [gameId])

  const refreshSessionHistory = useCallback(async () => {
    if (!gameId || !user?.id) {
      setSessionHistory([])
      return
    }

    try {
      const groups = await fetchOwnSessionHistory(gameId, user.id)
      setSessionHistory(groups)
    } catch (err) {
      console.error('세션 히스토리 갱신 실패:', err)
    }
  }, [gameId, user?.id])

  const refreshSharedHistory = useCallback(async () => {
    if (!gameId) {
      setSharedSessionHistory([])
      return
    }

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        console.error('세션 토큰 갱신 실패:', sessionError)
      }

      const token = sessionData?.session?.access_token || authToken
      if (!token) {
        setAuthToken(null)
        setSharedSessionHistory([])
        return
      }

      if (token !== authToken) {
        setAuthToken(token)
      }

      const sessions = await fetchSharedSessionHistory(gameId, token)
      setSharedSessionHistory(sessions)
    } catch (err) {
      console.error('공용 히스토리 갱신 실패:', err)
    }
  }, [authToken, gameId])

  const selectHero = useCallback((hero) => {
    try {
      if (hero) {
        window.localStorage.setItem('selectedHeroId', hero.id)
      } else {
        window.localStorage.removeItem('selectedHeroId')
      }
    } catch (err) {
      console.warn('로컬 저장 실패:', err)
    }
    setMyHero(hero || null)
  }, [])

  const joinGame = useCallback(
    async (roleOverride) => {
      if (!gameId || !user) {
        alert('로그인이 필요합니다.')
        return { ok: false }
      }
      if (!myHero) {
        alert('로스터에서 캐릭터를 선택하고 다시 시도하세요.')
        return { ok: false }
      }
      const resolveRoleMeta = () => {
        if (!roleOverride) return roles[0]
        if (typeof roleOverride === 'string') {
          const match = roles.find((role) => {
            if (typeof role === 'string') {
              return role === roleOverride
            }
            if (!role || typeof role !== 'object') return false
            return role.name === roleOverride
          })
          return match || roleOverride
        }
        return roleOverride
      }

      const roleMeta = resolveRoleMeta()
      const roleName =
        typeof roleMeta === 'string'
          ? roleMeta
          : typeof roleMeta?.name === 'string'
            ? roleMeta.name
            : ''

      if (!roleName) {
        alert('역할을 선택하세요.')
        return { ok: false }
      }

      let capacity = null
      if (roleMeta && typeof roleMeta === 'object') {
        const rawCapacity = Number(roleMeta.slot_count ?? roleMeta.slotCount ?? roleMeta.capacity)
        if (Number.isFinite(rawCapacity) && rawCapacity >= 0) {
          capacity = rawCapacity
        }
      }

      const roleSlots = slots.filter((slot) => {
        if (!slot || slot.active === false) return false
        const slotRole = typeof slot.role === 'string' ? slot.role.trim() : ''
        return slotRole === roleName
      })
      const alreadyClaimedSlot = roleSlots.find((slot) => slot?.hero_owner_id === user.id)
      const availableSlot = roleSlots.find((slot) => !slot?.hero_id && slot?.hero_owner_id == null)

      const joiningWithoutSlot = !alreadyClaimedSlot && !availableSlot

      const existingEntry =
        participants.find((participant) => participant?.owner_id === user.id) || null

      const nextScore = (() => {
        const rawScore = Number(existingEntry?.score)
        if (Number.isFinite(rawScore) && rawScore > 0) {
          return rawScore
        }
        const rawRating = Number(existingEntry?.rating)
        if (Number.isFinite(rawRating) && rawRating > 0) {
          return rawRating
        }
        return 1000
      })()

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        alert('세션 정보를 확인하지 못했습니다.')
        return { ok: false, error: sessionError }
      }
      const token = sessionData?.session?.access_token
      if (!token) {
        alert('로그인이 만료되었습니다. 다시 로그인해주세요.')
        onRequireLogin?.()
        return { ok: false, error: new Error('missing_session') }
      }

      const response = await fetch('/api/rank/join-game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          game_id: gameId,
          hero_id: myHero.id,
          role: roleName,
          score: nextScore,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        console.error('참여 실패 응답:', text)
        alert('참여에 실패했습니다. 잠시 후 다시 시도하세요.')
        return { ok: false, error: new Error(text) }
      }

      const result = await response.json()
      if (!result?.ok) {
        const message = result?.error || '참여에 실패했습니다.'
        alert(message)
        return { ok: false, error: new Error(message) }
      }

      await refreshParticipants()
      await refreshSlots()
      await refreshBattles()
      await refreshSessionHistory()
      if (joiningWithoutSlot && result?.overflow) {
        alert('기본 슬롯은 이미 채워졌습니다. 추가 참가자로 합류했으며 시작 조건은 기존 슬롯 충족 여부에 따라 달라집니다.')
      }
      return { ok: true, slot: result.slot, overflow: Boolean(result?.overflow) }
    },
    [
      gameId,
      myHero,
      onRequireLogin,
      participants,
      refreshBattles,
      refreshParticipants,
      refreshSessionHistory,
      refreshSlots,
      roles,
      slots,
      user,
    ]
  )

  const leaveGame = useCallback(async () => {
    if (!gameId || !user) {
      alert('로그인이 필요합니다.')
      return { ok: false }
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      alert('세션 정보를 확인하지 못했습니다.')
      return { ok: false, error: sessionError }
    }

    const token = sessionData?.session?.access_token
    if (!token) {
      alert('로그인이 만료되었습니다. 다시 로그인해주세요.')
      onRequireLogin?.()
      return { ok: false, error: new Error('missing_session') }
    }

    const response = await fetch('/api/rank/leave-game', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ game_id: gameId }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('슬롯 해제 실패 응답:', text)
      alert('슬롯을 비우는 데 실패했습니다. 잠시 후 다시 시도하세요.')
      return { ok: false, error: new Error(text) }
    }

    const result = await response.json()
    if (!result?.ok) {
      const message = result?.error || '슬롯을 비우는 데 실패했습니다.'
      alert(message)
      return { ok: false, error: new Error(message) }
    }

    await refreshParticipants()
    await refreshSlots()
    await refreshBattles()
    await refreshSessionHistory()

    return { ok: true }
  }, [
    gameId,
    onRequireLogin,
    refreshBattles,
    refreshParticipants,
    refreshSessionHistory,
    refreshSlots,
    user,
  ])

  const deleteRoom = useCallback(async () => {
    if (!gameId || !user || !game) return { ok: false }
    if (user.id !== game.owner_id) return { ok: false }

    setDeleting(true)
    try {
      await withTable(supabase, 'rank_battle_logs', (table) =>
        supabase.from(table).delete().eq('game_id', gameId)
      )
      await withTable(supabase, 'rank_participants', (table) =>
        supabase.from(table).delete().eq('game_id', gameId)
      )
      await withTable(supabase, 'rank_game_slots', (table) =>
        supabase.from(table).delete().eq('game_id', gameId)
      )
      await withTable(supabase, 'rank_games', (table) =>
        supabase.from(table).delete().eq('id', gameId)
      )
      onDeleted?.()
      return { ok: true }
    } catch (err) {
      console.error('방 삭제 실패:', err)
      alert('방 삭제 실패: ' + (err.message || err))
      return { ok: false, error: err }
    } finally {
      setDeleting(false)
    }
  }, [gameId, game, onDeleted, user])

  const myEntry = useMemo(() => {
    if (!myHero) return null
    return participants.find((participant) => participant.hero_id === myHero.id) || null
  }, [participants, myHero])

  const fallbackMinimum = useMemo(() => {
    if (!Array.isArray(roles) || !roles.length) return 1
    const names = new Set()
    roles.forEach((role) => {
      if (typeof role === 'string') {
        if (role.trim()) names.add(role.trim())
        return
      }
      if (role && typeof role === 'object' && typeof role.name === 'string') {
        const trimmed = role.name.trim()
        if (trimmed) names.add(trimmed)
      }
    })
    return Math.max(1, names.size)
  }, [roles])

  const minimumParticipants = useMemo(() => {
    if (Number.isFinite(requiredSlots) && requiredSlots > 0) {
      return requiredSlots
    }
    return fallbackMinimum
  }, [fallbackMinimum, requiredSlots])

  const activeSlots = useMemo(() => {
    if (!Array.isArray(slots)) return []
    return slots.filter((slot) => slot && slot.active !== false)
  }, [slots])

  const activeParticipants = useMemo(() => {
    if (!Array.isArray(participants)) return []
    return participants.filter((participant) => {
      if (!participant) return false
      const status = typeof participant?.status === 'string' ? participant.status.trim().toLowerCase() : ''
      if (status === 'out') {
        return false
      }
      const directHeroId = participant?.hero_id || participant?.heroId || null
      if (directHeroId) {
        return true
      }
      if (participant?.hero && participant.hero.id) {
        return true
      }
      if (Array.isArray(participant?.hero_ids)) {
        return participant.hero_ids.some((value) => Boolean(value))
      }
      return false
    })
  }, [participants])

  const roleOccupancy = useMemo(() => {
    const order = []
    const map = new Map()

    const register = (rawName) => {
      const name = typeof rawName === 'string' ? rawName.trim() : ''
      if (!name) return null
      if (!map.has(name)) {
        map.set(name, {
          name,
          capacity: null,
          totalSlots: 0,
          occupiedSlots: 0,
          participantCount: 0,
        })
        order.push(name)
      }
      return map.get(name)
    }

    if (Array.isArray(roles)) {
      roles.forEach((role) => {
        if (typeof role === 'string') {
          register(role)
          return
        }
        if (!role || typeof role !== 'object') return
        const entry = register(role.name)
        if (!entry) return
        const rawCapacity = Number(role.slot_count ?? role.slotCount ?? role.capacity)
        if (Number.isFinite(rawCapacity) && rawCapacity >= 0) {
          entry.capacity = rawCapacity
        }
      })
    }

    activeSlots.forEach((slot) => {
      const entry = register(slot?.role)
      if (!entry) return
      entry.totalSlots += 1
      const heroId = slot?.hero_id ?? slot?.heroId ?? slot?.heroID
      if (heroId) {
        entry.occupiedSlots += 1
      }
    })

    activeParticipants.forEach((participant) => {
      const entry = register(participant?.role)
      if (!entry) return
      entry.participantCount += 1
    })

    return order
      .map((name) => {
        const entry = map.get(name)
        if (!entry) return null
        const numericCapacity =
          Number.isFinite(Number(entry.capacity)) && Number(entry.capacity) >= 0
            ? Number(entry.capacity)
            : null
        const totalSlots = entry.totalSlots > 0 ? entry.totalSlots : numericCapacity
        let occupiedSlots = entry.occupiedSlots
        if (occupiedSlots <= 0 && entry.participantCount > 0) {
          occupiedSlots = entry.participantCount
        }
        if (totalSlots != null && occupiedSlots > totalSlots) {
          occupiedSlots = totalSlots
        }
        const availableSlots = totalSlots != null ? Math.max(totalSlots - occupiedSlots, 0) : null

        return {
          name,
          capacity: numericCapacity,
          totalSlots: totalSlots != null ? totalSlots : null,
          occupiedSlots,
          availableSlots,
          participantCount: entry.participantCount,
        }
      })
      .filter(Boolean)
  }, [activeParticipants, activeSlots, participants, roles])

  const roleLeaderboards = useMemo(() => {
    if (!Array.isArray(participants) || participants.length === 0) {
      return []
    }

    const seenOrder = new Set()
    const order = []
    const pushOrder = (raw) => {
      const name = typeof raw === 'string' ? raw.trim() : ''
      if (!name || seenOrder.has(name)) return
      seenOrder.add(name)
      order.push(name)
    }

    if (Array.isArray(roleOccupancy) && roleOccupancy.length) {
      roleOccupancy.forEach((entry) => {
        if (!entry) return
        pushOrder(entry.name)
      })
    }

    if (Array.isArray(roles) && roles.length) {
      roles.forEach((role) => {
        if (typeof role === 'string') {
          pushOrder(role)
          return
        }
        if (!role || typeof role !== 'object') return
        pushOrder(role.name)
      })
    }

    const groups = new Map()
    participants.forEach((participant) => {
      const roleName = typeof participant?.role === 'string' ? participant.role.trim() : ''
      if (!roleName) return
      if (!groups.has(roleName)) {
        groups.set(roleName, [])
      }
      groups.get(roleName).push(participant)
      pushOrder(roleName)
    })

    if (!groups.size) {
      return []
    }

    const toNumberOrNull = (value) => {
      const numeric = Number(value)
      return Number.isFinite(numeric) ? numeric : null
    }

    const result = []

    order.forEach((roleName) => {
      const bucket = groups.get(roleName)
      if (!bucket || bucket.length === 0) {
        return
      }

      const sorted = bucket
        .slice()
        .sort((a, b) => {
          const ratingA = toNumberOrNull(a?.rating)
          const ratingB = toNumberOrNull(b?.rating)
          if (ratingA != null || ratingB != null) {
            return (ratingB ?? Number.NEGATIVE_INFINITY) - (ratingA ?? Number.NEGATIVE_INFINITY)
          }

          const scoreA = toNumberOrNull(a?.score)
          const scoreB = toNumberOrNull(b?.score)
          if (scoreA != null || scoreB != null) {
            return (scoreB ?? Number.NEGATIVE_INFINITY) - (scoreA ?? Number.NEGATIVE_INFINITY)
          }

          const winRateA = toNumberOrNull(a?.win_rate ?? a?.winRate)
          const winRateB = toNumberOrNull(b?.win_rate ?? b?.winRate)
          if (winRateA != null || winRateB != null) {
            return (winRateB ?? Number.NEGATIVE_INFINITY) - (winRateA ?? Number.NEGATIVE_INFINITY)
          }

          const battlesA = toNumberOrNull(a?.battles)
          const battlesB = toNumberOrNull(b?.battles)
          if (battlesA != null || battlesB != null) {
            return (battlesB ?? Number.NEGATIVE_INFINITY) - (battlesA ?? Number.NEGATIVE_INFINITY)
          }

          const heroNameA = typeof a?.hero?.name === 'string' ? a.hero.name : ''
          const heroNameB = typeof b?.hero?.name === 'string' ? b.hero.name : ''
          return heroNameA.localeCompare(heroNameB, 'ko')
        })

      const entries = sorted.slice(0, 5).map((participant) => {
        const rating = toNumberOrNull(participant?.rating)
        const score = toNumberOrNull(participant?.score)
        const winRate = toNumberOrNull(participant?.win_rate ?? participant?.winRate)
        const battles = toNumberOrNull(participant?.battles)
        const hero = participant?.hero || null
        const heroName =
          typeof hero?.name === 'string' && hero.name.trim()
            ? hero.name.trim()
            : participant?.hero_id
            ? `#${participant.hero_id}`
            : '미지정'

        return {
          id: participant?.id || `${roleName}-${participant?.owner_id || heroName}`,
          ownerId: participant?.owner_id || null,
          heroId: participant?.hero_id || null,
          hero,
          heroName,
          rating,
          score,
          winRate,
          battles,
        }
      })

      result.push({
        role: roleName,
        entries,
        totalParticipants: bucket.length,
        remainingCount: bucket.length - entries.length,
      })
    })

    return result
  }, [participants, roleOccupancy, roles])

  const filledSlotCount = useMemo(
    () => activeSlots.filter((slot) => slot?.hero_id).length,
    [activeSlots],
  )

  const totalActiveSlots = activeSlots.length

  const canStart = useMemo(() => {
    if (totalActiveSlots > 0) {
      return filledSlotCount >= totalActiveSlots
    }
    return activeParticipants.length >= minimumParticipants
  }, [activeParticipants.length, filledSlotCount, minimumParticipants, totalActiveSlots])

  const isOwner = useMemo(() => {
    if (!user || !game) return false
    return user.id === game.owner_id
  }, [game, user])

  const alreadyJoined = !!myEntry

  return {
    state: {
      loading,
      user,
      game,
      roles,
      participants,
      slots,
      myHero,
      recentBattles,
      deleting,
      sessionHistory,
      sharedSessionHistory,
    },
    derived: {
      canStart,
      isOwner,
      alreadyJoined,
      myEntry,
      minimumParticipants,
      activeParticipants,
      roleOccupancy,
      roleLeaderboards,
    },
    actions: {
      selectHero,
      joinGame,
      leaveGame,
      deleteRoom,
      refreshParticipants,
      refreshBattles,
      refreshSlots,
      refreshSessionHistory,
      refreshSharedHistory,
    },
  }
}

// 
