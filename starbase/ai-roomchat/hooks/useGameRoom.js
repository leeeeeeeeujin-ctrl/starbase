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

async function fetchSlotGrid(gameId) {
  if (!gameId) {
    return { slots: [], counts: new Map() }
  }

  const { data, error } = await withTable(supabase, 'rank_game_slots', (table) =>
    supabase
      .from(table)
      .select('id, slot_index, role, active, hero_id, hero_owner_id, updated_at')
      .eq('game_id', gameId)
      .order('slot_index', { ascending: true }),
  )

  if (error) throw error

  const slots = (Array.isArray(data) ? data : []).map((slot) => ({
    id: slot.id,
    slot_index: slot.slot_index,
    role: typeof slot.role === 'string' ? slot.role.trim() : '',
    active: slot.active !== false,
    hero_id: slot.hero_id || null,
    hero_owner_id: slot.hero_owner_id || null,
    updated_at: slot.updated_at || null,
  }))

  const counts = new Map()
  slots.forEach((slot) => {
    if (!slot.role || slot.active === false) return
    counts.set(slot.role, (counts.get(slot.role) || 0) + 1)
  })

  return { slots, counts }
}

function summariseSlotOccupancy(slots, { heroId, ownerId } = {}) {
  const myHeroId = heroId ? String(heroId) : ''
  const myOwnerId = ownerId ? String(ownerId) : ''
  const map = new Map()

  slots.forEach((slot) => {
    if (!slot || slot.active === false) return
    const role = typeof slot.role === 'string' ? slot.role.trim() : ''
    if (!role) return

    const entry = map.get(role) || { active: 0, occupied: 0, mine: 0 }
    entry.active += 1

    if (slot.hero_id || slot.hero_owner_id) {
      entry.occupied += 1
      const slotHeroId = slot.hero_id ? String(slot.hero_id) : ''
      const slotOwnerId = slot.hero_owner_id ? String(slot.hero_owner_id) : ''
      if ((myHeroId && slotHeroId && slotHeroId === myHeroId) || (myOwnerId && slotOwnerId && slotOwnerId === myOwnerId)) {
        entry.mine += 1
      }
    }

    map.set(role, entry)
  })

  return map
}

async function claimSlotForParticipant({ gameId, slot, heroId, ownerId }) {
  if (!gameId || !slot?.id) {
    return { ok: false, error: 'slot_missing' }
  }

  const payload = {
    hero_id: heroId ?? null,
    hero_owner_id: ownerId ?? null,
    updated_at: new Date().toISOString(),
  }

  const result = await withTable(supabase, 'rank_game_slots', (table) => {
    let query = supabase
      .from(table)
      .update(payload)
      .eq('game_id', gameId)
      .eq('id', slot.id)

    if (slot.active === false) {
      query = query.eq('active', false)
    } else {
      query = query.eq('active', true)
    }

    if (slot.hero_id) {
      query = query.eq('hero_id', slot.hero_id)
    } else {
      query = query.is('hero_id', null)
    }

    if (slot.hero_owner_id) {
      query = query.eq('hero_owner_id', slot.hero_owner_id)
    } else {
      query = query.is('hero_owner_id', null)
    }

    return query
  })

  if (result?.error) {
    console.warn('슬롯 점유 실패:', result.error)
    return { ok: false, error: result.error.message || '슬롯을 점유하지 못했습니다.' }
  }

  return { ok: true }
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
  const [slots, setSlots] = useState([])
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
        let slotRows = []
        try {
          const grid = await fetchSlotGrid(gameId)
          slotCounts = grid.counts
          slotRows = grid.slots
        } catch (slotError) {
          console.warn('슬롯 정보를 불러오지 못했습니다:', slotError)
          slotCounts = new Map()
          slotRows = []
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

        if (!alive) return

        setSlots(slotRows)
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

  const refreshSlots = useCallback(async () => {
    if (!gameId) return []
    try {
      const grid = await fetchSlotGrid(gameId)
      setSlots(grid.slots)
      return grid.slots
    } catch (err) {
      console.error('슬롯 갱신 실패:', err)
      return []
    }
  }, [gameId])

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

  const slotSummary = useMemo(
    () => summariseSlotOccupancy(slots, { heroId: myHero?.id, ownerId: user?.id }),
    [slots, myHero?.id, user?.id],
  )

  const participantsByRole = useMemo(() => {
    const map = new Map()
    participants.forEach((participant) => {
      const role = typeof participant?.role === 'string' ? participant.role.trim() : ''
      if (!role) return
      map.set(role, (map.get(role) || 0) + 1)
    })
    return map
  }, [participants])

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

      const slotSnapshot = await refreshSlots()
      const slotList = slotSnapshot.length ? slotSnapshot : slots
      const heroId = myHero.id
      const ownerId = user.id
      const occupancySnapshot = summariseSlotOccupancy(slotList, { heroId, ownerId })
      const roleSummarySnapshot = roleName ? occupancySnapshot.get(roleName) : null
      const activeSlots = roleSummarySnapshot?.active ?? null
      const occupiedSlots = roleSummarySnapshot?.occupied ?? 0
      const alreadyOccupyingSlot = roleSummarySnapshot?.mine > 0

      if (
        activeSlots != null &&
        activeSlots > 0 &&
        occupiedSlots >= activeSlots &&
        !alreadyOccupyingSlot &&
        !alreadyInRole
      ) {
        alert('이미 정원이 가득 찬 역할입니다.')
        return { ok: false }
      }

      let roleSlots = []
      if (roleName) {
        roleSlots = slotList.filter((slot) => slot.role === roleName && slot.active)
      }

      const normalizedHeroId = heroId ? String(heroId) : ''
      const normalizedOwnerId = ownerId ? String(ownerId) : ''

      let targetSlot = roleSlots.find((slot) => {
        const slotHeroId = slot.hero_id ? String(slot.hero_id) : ''
        const slotOwnerId = slot.hero_owner_id ? String(slot.hero_owner_id) : ''
        return (
          (normalizedHeroId && slotHeroId && slotHeroId === normalizedHeroId) ||
          (normalizedOwnerId && slotOwnerId && slotOwnerId === normalizedOwnerId)
        )
      })

      if (!targetSlot) {
        targetSlot = roleSlots.find((slot) => !slot.hero_id && !slot.hero_owner_id)
      }

      if (
        !targetSlot &&
        roleSlots.length > 0 &&
        activeSlots != null &&
        activeSlots > 0 &&
        !alreadyOccupyingSlot &&
        !alreadyInRole
      ) {
        alert('사용 가능한 슬롯을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.')
        return { ok: false }
      }

      const payload = {
        game_id: gameId,
        hero_id: myHero.id,
        owner_id: user.id,
        role: roleName,
        score: 1000,
      }

      const { error } = await withTable(supabase, 'rank_participants', (table) =>
        supabase.from(table).insert(payload, { ignoreDuplicates: true })
      )

      if (error) {
        alert('참여 실패: ' + error.message)
        return { ok: false, error }
      }

      if (targetSlot) {
        const claimResult = await claimSlotForParticipant({
          gameId,
          slot: targetSlot,
          heroId: myHero.id,
          ownerId: user.id,
        })

        if (claimResult.ok) {
          setSlots((prev) =>
            prev.map((slot) => {
              if (slot.id !== targetSlot.id) return slot
              return {
                ...slot,
                hero_id: myHero.id,
                hero_owner_id: user.id,
                updated_at: new Date().toISOString(),
              }
            }),
          )
        } else {
          console.warn('슬롯 점유 실패:', claimResult.error)
          await refreshSlots()
        }
      } else {
        await refreshSlots()
      }

      await refreshParticipants()
      await refreshBattles()
      return { ok: true }
    },
    [gameId, myHero, participants, refreshBattles, refreshParticipants, refreshSlots, roles, slots, user]
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

  const canStart = useMemo(() => {
    if (participants.length < minimumParticipants) {
      return false
    }

    const roleList = Array.isArray(roles) ? roles : []
    if (!roleList.length) {
      return participants.length >= minimumParticipants
    }

    const hasSlotSummary = slotSummary && slotSummary.size > 0

    for (const roleMeta of roleList) {
      const roleName =
        typeof roleMeta === 'string'
          ? roleMeta.trim()
          : typeof roleMeta?.name === 'string'
            ? roleMeta.name.trim()
            : ''

      if (!roleName) {
        continue
      }

      const rawCapacity = Number(roleMeta?.slot_count ?? roleMeta?.slotCount ?? roleMeta?.capacity)
      const requiredCount = Number.isFinite(rawCapacity) && rawCapacity > 0 ? rawCapacity : null
      const participantCount = participantsByRole.get(roleName) || 0
      const summaryEntry = slotSummary?.get(roleName) || null
      const occupiedCount = summaryEntry ? Math.max(summaryEntry.occupied, participantCount) : participantCount

      if (requiredCount != null) {
        if (occupiedCount < requiredCount) {
          return false
        }
        continue
      }

      if (hasSlotSummary) {
        const activeCount = summaryEntry?.active ?? 0
        if (activeCount > 0 && occupiedCount < activeCount) {
          return false
        }
      } else if (participantCount === 0) {
        return false
      }
    }

    return true
  }, [minimumParticipants, participants.length, participantsByRole, roles, slotSummary])

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
      refreshSlots,
      refreshParticipants,
      refreshBattles,
    },
  }
}

// 
