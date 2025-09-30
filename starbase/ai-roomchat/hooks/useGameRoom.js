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
        'id, game_id, hero_id, owner_id, role, score, rating, battles, win_rate, created_at'
      )
      .eq('game_id', gameId)
      .order('score', { ascending: false })
  )

  if (participantError) throw participantError

  const participants = participantsData || []
  const heroIds = participants.map((p) => p.hero_id).filter(Boolean)

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
  const [game, setGame] = useState(null)
  const [roles, setRoles] = useState([])
  const [participants, setParticipants] = useState([])
  const [myHero, setMyHero] = useState(null)
  const [recentBattles, setRecentBattles] = useState([])
  const [deleting, setDeleting] = useState(false)
  const [requiredSlots, setRequiredSlots] = useState(0)

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

        setRoles(resolvedRoles)
        setRequiredSlots(computeRequiredSlots(resolvedRoles, slotCounts))

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

      const currentCount = participants.filter((participant) => participant?.role === roleName).length
      const alreadyInRole = participants.some((participant) => participant?.hero_id === myHero.id)

      if (capacity != null && currentCount >= capacity && !alreadyInRole) {
        alert('이미 정원이 가득 찬 역할입니다.')
        return { ok: false }
      }

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

      const payload = {
        game_id: gameId,
        hero_id: myHero.id,
        owner_id: user.id,
        role: roleName,
        score: nextScore,
        updated_at: new Date().toISOString(),
      }

      const { error } = await withTable(supabase, 'rank_participants', (table) =>
        supabase
          .from(table)
          .upsert(payload, { onConflict: 'game_id,owner_id', ignoreDuplicates: false })
      )

      if (error) {
        alert('참여 실패: ' + error.message)
        return { ok: false, error }
      }

      await refreshParticipants()
      await refreshBattles()
      return { ok: true }
    },
    [gameId, myHero, participants, refreshBattles, refreshParticipants, roles, user]
  )

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

  const canStart = useMemo(
    () => participants.length >= minimumParticipants,
    [minimumParticipants, participants.length],
  )

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
      myHero,
      recentBattles,
      deleting,
    },
    derived: {
      canStart,
      isOwner,
      alreadyJoined,
      myEntry,
      minimumParticipants,
    },
    actions: {
      selectHero,
      joinGame,
      deleteRoom,
      refreshParticipants,
      refreshBattles,
    },
  }
}

// 
