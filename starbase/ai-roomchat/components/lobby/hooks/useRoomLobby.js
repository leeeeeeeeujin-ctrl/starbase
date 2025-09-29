import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import { withTable } from '../../../lib/supabaseTables'

const HOST_IDLE_TIMEOUT_MS = 1000 * 60 * 3 // 3 minutes

function nowIso() {
  return new Date().toISOString()
}

function generateRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    const index = Math.floor(Math.random() * alphabet.length)
    code += alphabet[index]
  }
  return code
}

function normaliseRoom(row) {
  if (!row) return null
  return {
    id: row.id,
    gameId: row.game_id,
    code: row.code,
    mode: row.mode,
    status: row.status,
    ownerId: row.owner_id,
    slotCount: row.slot_count ?? 0,
    filledCount: row.filled_count ?? 0,
    readyCount: row.ready_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hostLastActiveAt: row.host_last_active_at,
    game: row.game
      ? {
          id: row.game.id,
          name: row.game.name,
          imageUrl: row.game.image_url ?? row.game.cover_path ?? null,
          description: row.game.description || '',
          roles: Array.isArray(row.game.roles) ? row.game.roles : [],
        }
      : null,
  }
}

function normaliseSlot(row, heroMap) {
  const hero = row.occupant_hero_id ? heroMap.get(row.occupant_hero_id) || null : null
  return {
    id: row.id,
    index: row.slot_index,
    role: row.role,
    occupantOwnerId: row.occupant_owner_id,
    occupantHeroId: row.occupant_hero_id,
    occupantReady: Boolean(row.occupant_ready),
    joinedAt: row.joined_at,
    updatedAt: row.updated_at,
    hero,
  }
}

async function fetchActiveSlots(gameId) {
  const result = await withTable(supabase, 'rank_game_slots', (table) =>
    supabase
      .from(table)
      .select('slot_index, role, active')
      .eq('game_id', gameId)
      .order('slot_index'),
  )
  if (result?.error) throw result.error
  const rows = Array.isArray(result?.data) ? result.data : []
  return rows.filter((row) => row.active !== false)
}

async function fetchRoomSlots(roomId) {
  const result = await withTable(supabase, 'rank_room_slots', (table) =>
    supabase
      .from(table)
      .select('id, room_id, slot_index, role, occupant_owner_id, occupant_hero_id, occupant_ready, joined_at, updated_at')
      .eq('room_id', roomId)
      .order('slot_index'),
  )
  if (result?.error) throw result.error
  return Array.isArray(result?.data) ? result.data : []
}

async function recomputeRoomStats(roomId) {
  const slotRows = await fetchRoomSlots(roomId)
  const filled = slotRows.filter((row) => row.occupant_owner_id).length
  const ready = slotRows.filter((row) => row.occupant_owner_id && row.occupant_ready).length
  await withTable(supabase, 'rank_rooms', (table) =>
    supabase
      .from(table)
      .update({ filled_count: filled, ready_count: ready, updated_at: nowIso() })
      .eq('id', roomId),
  )
  return { filled, ready }
}

async function touchRoom(roomId, { hostActivity = false } = {}) {
  const payload = { updated_at: nowIso() }
  if (hostActivity) {
    payload.host_last_active_at = payload.updated_at
  }
  await withTable(supabase, 'rank_rooms', (table) => supabase.from(table).update(payload).eq('id', roomId))
}

async function loadViewerId() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return null
  return data.user.id
}

async function fetchAvailableGames() {
  const result = await withTable(supabase, 'rank_games', (table) =>
    supabase
      .from(table)
      .select('id, name, image_url, roles')
      .order('created_at', { ascending: false })
      .limit(40),
  )
  if (result?.error) throw result.error
  const rows = Array.isArray(result?.data) ? result.data : []
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    imageUrl: row.image_url ?? null,
    roles: Array.isArray(row.roles) ? row.roles : [],
  }))
}

async function decorateSlotsWithHeroes(slotRows) {
  const heroIds = slotRows
    .map((row) => row.occupant_hero_id)
    .filter(Boolean)
  if (heroIds.length === 0) {
    return { slots: slotRows, heroes: new Map() }
  }
  const uniqueIds = Array.from(new Set(heroIds))
  const result = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select('id, name, image_url, owner_id')
      .in('id', uniqueIds),
  )
  if (result?.error) throw result.error
  const rows = Array.isArray(result?.data) ? result.data : []
  const map = new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, imageUrl: row.image_url ?? null, ownerId: row.owner_id }]))
  return { slots: slotRows, heroes: map }
}

function computeViewerSlot(slots, viewerId) {
  if (!viewerId) return null
  return slots.find((slot) => slot.occupantOwnerId === viewerId) || null
}

function computeHostInactive(room) {
  if (!room?.hostLastActiveAt) return false
  try {
    const last = new Date(room.hostLastActiveAt).getTime()
    if (Number.isNaN(last)) return false
    return Date.now() - last > HOST_IDLE_TIMEOUT_MS
  } catch (error) {
    return false
  }
}

function useRevision() {
  const [value, setValue] = useState(0)
  const bump = useCallback(() => setValue((current) => current + 1), [])
  return [value, bump]
}

export default function useRoomLobby({ enabled } = {}) {
  const [viewerId, setViewerId] = useState(null)
  const [mode, setModeState] = useState('duo')
  const [rooms, setRooms] = useState([])
  const [roomLoading, setRoomLoading] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [slots, setSlots] = useState([])
  const [roomDetailLoading, setRoomDetailLoading] = useState(false)
  const [availableGames, setAvailableGames] = useState([])
  const [gameLoading, setGameLoading] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [joinLoading, setJoinLoading] = useState(false)
  const [readyLoading, setReadyLoading] = useState(false)
  const [startLoading, setStartLoading] = useState(false)
  const [joinCodeLoading, setJoinCodeLoading] = useState(false)
  const [error, setError] = useState('')
  const [roomsRevision, bumpRoomsRevision] = useRevision()
  const [detailRevision, bumpDetailRevision] = useRevision()

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    async function run() {
      const id = await loadViewerId()
      if (!cancelled) {
        setViewerId(id)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    setGameLoading(true)
    let cancelled = false
    fetchAvailableGames()
      .then((list) => {
        if (!cancelled) setAvailableGames(list)
      })
      .catch((cause) => {
        console.error('방 생성을 위한 게임 목록을 불러오지 못했습니다:', cause)
        if (!cancelled) setAvailableGames([])
      })
      .finally(() => {
        if (!cancelled) setGameLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  const changeMode = useCallback((nextMode) => {
    setModeState(nextMode)
    setSelectedRoom(null)
    setSlots([])
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    async function loadRooms() {
      setRoomLoading(true)
      setError('')
      try {
        const result = await withTable(supabase, 'rank_rooms', (table) => {
          let query = supabase
            .from(table)
            .select(
              'id, game_id, owner_id, code, mode, status, slot_count, filled_count, ready_count, created_at, updated_at, host_last_active_at, game:rank_games(id,name,image_url,description,roles)',
            )
            .order('created_at', { ascending: false })
            .limit(40)
          if (mode !== 'all') {
            query = query.eq('mode', mode)
          }
          return query
        })
        if (result?.error) throw result.error
        const rows = Array.isArray(result?.data) ? result.data : []
        const nextRooms = rows.map((row) => normaliseRoom(row))
        if (!cancelled) {
          setRooms(nextRooms)
        }
      } catch (cause) {
        console.error('방 목록을 불러오지 못했습니다:', cause)
        if (!cancelled) {
          setError(cause.message || '방 목록을 불러오지 못했습니다.')
          setRooms([])
        }
      } finally {
        if (!cancelled) {
          setRoomLoading(false)
        }
      }
    }
    loadRooms()
    return () => {
      cancelled = true
    }
  }, [enabled, mode, roomsRevision])

  useEffect(() => {
    if (!enabled) return
    if (!selectedRoom) return
    let cancelled = false
    async function loadDetail() {
      setRoomDetailLoading(true)
      try {
        const roomResult = await withTable(supabase, 'rank_rooms', (table) =>
          supabase
            .from(table)
            .select(
              'id, game_id, owner_id, code, mode, status, slot_count, filled_count, ready_count, created_at, updated_at, host_last_active_at, game:rank_games(id,name,image_url,description,roles)',
            )
            .eq('id', selectedRoom.id)
            .maybeSingle(),
        )
        if (roomResult?.error) throw roomResult.error
        const roomRow = roomResult?.data
        const slotRows = await fetchRoomSlots(selectedRoom.id)
        const { heroes, slots: decorated } = await decorateSlotsWithHeroes(slotRows)
        const enriched = decorated.map((row) => normaliseSlot(row, heroes))
        if (!cancelled) {
          setSelectedRoom(normaliseRoom(roomRow))
          setSlots(enriched)
        }
      } catch (cause) {
        console.error('방 정보를 불러오지 못했습니다:', cause)
        if (!cancelled) {
          setError(cause.message || '방 정보를 불러오지 못했습니다.')
          setSelectedRoom(null)
          setSlots([])
        }
      } finally {
        if (!cancelled) {
          setRoomDetailLoading(false)
        }
      }
    }
    loadDetail()
    return () => {
      cancelled = true
    }
  }, [enabled, detailRevision, selectedRoom?.id])

  const viewerSlot = useMemo(() => computeViewerSlot(slots, viewerId), [slots, viewerId])
  const hostInactive = useMemo(() => computeHostInactive(selectedRoom), [selectedRoom])

  const refreshRooms = useCallback(() => {
    bumpRoomsRevision()
  }, [bumpRoomsRevision])

  const refreshSelectedRoom = useCallback(() => {
    bumpDetailRevision()
  }, [bumpDetailRevision])

  const selectRoomById = useCallback(
    (roomId) => {
      const room = rooms.find((candidate) => candidate.id === roomId) || null
      if (room) {
        setSelectedRoom(room)
      } else {
        setSelectedRoom(roomId ? { id: roomId } : null)
      }
      setSlots([])
      refreshSelectedRoom()
    },
    [refreshSelectedRoom, rooms],
  )

  const loadRoleOptions = useCallback(async (gameId) => {
    if (!gameId) return []
    const slotsForGame = await fetchActiveSlots(gameId)
    const counts = new Map()
    slotsForGame.forEach((slot) => {
      const role = slot.role || '역할 미지정'
      counts.set(role, (counts.get(role) || 0) + 1)
    })
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
  }, [])

  const createRoom = useCallback(
    async ({ gameId, roomMode, duoRole }) => {
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      if (!gameId) {
        return { ok: false, error: '게임을 선택해 주세요.' }
      }
      const targetMode = roomMode || mode
      setCreateLoading(true)
      try {
        const slotsForGame = await fetchActiveSlots(gameId)
        if (!slotsForGame.length) {
          return { ok: false, error: '활성화된 슬롯이 없는 게임입니다.' }
        }
        let selectedSlots = slotsForGame
        if (targetMode === 'duo') {
          const filtered = slotsForGame.filter((slot) => slot.role === duoRole)
          if (filtered.length < 2) {
            return { ok: false, error: '해당 역할군으로 듀오 방을 만들 수 없습니다.' }
          }
          selectedSlots = filtered.slice(0, 2)
        }
        const now = nowIso()
        let roomRow = null
        let lastError = null
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const roomCode = generateRoomCode()
          const insertResult = await withTable(supabase, 'rank_rooms', (table) =>
            supabase
              .from(table)
              .insert(
                {
                  game_id: gameId,
                  owner_id: viewerId,
                  code: roomCode,
                  mode: targetMode,
                  status: 'open',
                  slot_count: selectedSlots.length,
                  filled_count: 0,
                  ready_count: 0,
                  host_last_active_at: now,
                  created_at: now,
                  updated_at: now,
                },
                { defaultToNull: false },
              )
              .select()
              .single(),
          )
          if (!insertResult?.error) {
            roomRow = insertResult.data
            break
          }
          lastError = insertResult.error
          if (insertResult.error?.code !== '23505') {
            throw insertResult.error
          }
        }

        if (!roomRow) {
          throw lastError || new Error('방 코드를 생성하지 못했습니다.')
        }
        const slotPayload = selectedSlots.map((slot, index) => ({
          room_id: roomRow.id,
          slot_index: index,
          role: slot.role,
          occupant_owner_id: null,
          occupant_hero_id: null,
          occupant_ready: false,
          joined_at: null,
          updated_at: now,
        }))
        if (slotPayload.length) {
          const slotInsert = await withTable(supabase, 'rank_room_slots', (table) =>
            supabase.from(table).insert(slotPayload, { defaultToNull: false }),
          )
          if (slotInsert?.error) throw slotInsert.error
        }
        await recomputeRoomStats(roomRow.id)
        refreshRooms()
        selectRoomById(roomRow.id)
        return { ok: true, room: normaliseRoom({ ...roomRow }) }
      } catch (cause) {
        console.error('방 생성 실패:', cause)
        return { ok: false, error: cause.message || '방을 만들지 못했습니다.' }
      } finally {
        setCreateLoading(false)
      }
    },
    [mode, refreshRooms, selectRoomById, viewerId],
  )

  const ensureNotInOtherRoom = useCallback(
    async () => {
      if (!viewerId) return { ok: false, error: '로그인이 필요합니다.' }
      const result = await withTable(supabase, 'rank_room_slots', (table) =>
        supabase.from(table).select('id, room_id').eq('occupant_owner_id', viewerId).limit(1),
      )
      if (result?.error) throw result.error
      const rows = Array.isArray(result?.data) ? result.data : []
      if (rows.length > 0) {
        return { ok: false, error: '이미 다른 방에 참여 중입니다.' }
      }
      return { ok: true }
    },
    [viewerId],
  )

  const joinSlot = useCallback(
    async (slotId) => {
      if (!selectedRoom) {
        return { ok: false, error: '방을 선택해 주세요.' }
      }
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      if (!slotId) {
        return { ok: false, error: '참여할 슬롯을 선택해 주세요.' }
      }
      if (joinLoading) {
        return { ok: false, error: '참여 처리가 진행 중입니다.' }
      }

      let storedHeroId = null
      if (typeof window !== 'undefined') {
        try {
          storedHeroId = window.localStorage.getItem('selectedHeroId')
        } catch (cause) {
          console.warn('선택한 캐릭터 정보를 불러오지 못했습니다:', cause)
        }
      }
      if (!storedHeroId) {
        return { ok: false, error: '참여 전에 사용할 캐릭터를 선택해 주세요.' }
      }

      setJoinLoading(true)
      try {
        if (viewerSlot && viewerSlot.id === slotId) {
          return { ok: true }
        }
        if (!viewerSlot) {
          const check = await ensureNotInOtherRoom()
          if (!check.ok) {
            return check
          }
        }
        const updateResult = await withTable(supabase, 'rank_room_slots', (table) =>
          supabase
            .from(table)
            .update({
              occupant_owner_id: viewerId,
              occupant_hero_id: storedHeroId,
              occupant_ready: false,
              joined_at: nowIso(),
              updated_at: nowIso(),
            })
            .eq('id', slotId)
            .is('occupant_owner_id', null),
        )
        if (updateResult?.error) throw updateResult.error
        await recomputeRoomStats(selectedRoom.id)
        if (selectedRoom.ownerId === viewerId) {
          await touchRoom(selectedRoom.id, { hostActivity: true })
        }
        refreshSelectedRoom()
        refreshRooms()
        return { ok: true }
      } catch (cause) {
        console.error('방 참가 실패:', cause)
        return { ok: false, error: cause.message || '방에 참가하지 못했습니다.' }
      } finally {
        setJoinLoading(false)
      }
    },
    [ensureNotInOtherRoom, joinLoading, refreshRooms, refreshSelectedRoom, selectedRoom, viewerId, viewerSlot],
  )

  const leaveSlot = useCallback(
    async (slotId) => {
      if (!selectedRoom) {
        return { ok: false, error: '방을 선택해 주세요.' }
      }
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      if (!slotId) {
        return { ok: false, error: '슬롯이 지정되지 않았습니다.' }
      }
      try {
        const updateResult = await withTable(supabase, 'rank_room_slots', (table) =>
          supabase
            .from(table)
            .update({
              occupant_owner_id: null,
              occupant_hero_id: null,
              occupant_ready: false,
              updated_at: nowIso(),
            })
            .eq('id', slotId)
            .eq('occupant_owner_id', viewerId),
        )
        if (updateResult?.error) throw updateResult.error
        await recomputeRoomStats(selectedRoom.id)
        if (selectedRoom.ownerId === viewerId) {
          await touchRoom(selectedRoom.id, { hostActivity: true })
        }
        refreshSelectedRoom()
        refreshRooms()
        return { ok: true }
      } catch (cause) {
        console.error('방 나가기 실패:', cause)
        return { ok: false, error: cause.message || '방에서 나가지 못했습니다.' }
      }
    },
    [refreshRooms, refreshSelectedRoom, selectedRoom, viewerId],
  )

  const toggleReady = useCallback(
    async (slotId, ready) => {
      if (!selectedRoom) {
        return { ok: false, error: '방을 선택해 주세요.' }
      }
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      if (!slotId) {
        return { ok: false, error: '슬롯이 지정되지 않았습니다.' }
      }
      if (readyLoading) {
        return { ok: false, error: '준비 상태를 변경하는 중입니다.' }
      }
      setReadyLoading(true)
      try {
        const updateResult = await withTable(supabase, 'rank_room_slots', (table) =>
          supabase
            .from(table)
            .update({ occupant_ready: ready, updated_at: nowIso() })
            .eq('id', slotId)
            .eq('occupant_owner_id', viewerId),
        )
        if (updateResult?.error) throw updateResult.error
        await recomputeRoomStats(selectedRoom.id)
        if (selectedRoom.ownerId === viewerId) {
          await touchRoom(selectedRoom.id, { hostActivity: true })
        }
        refreshSelectedRoom()
        refreshRooms()
        return { ok: true }
      } catch (cause) {
        console.error('준비 상태 변경 실패:', cause)
        return { ok: false, error: cause.message || '준비 상태를 바꾸지 못했습니다.' }
      } finally {
        setReadyLoading(false)
      }
    },
    [readyLoading, refreshRooms, refreshSelectedRoom, selectedRoom, viewerId],
  )

  const kickSlot = useCallback(
    async (slotId) => {
      if (!selectedRoom) {
        return { ok: false, error: '방을 선택해 주세요.' }
      }
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      if (selectedRoom.ownerId !== viewerId) {
        return { ok: false, error: '방장만 강퇴할 수 있습니다.' }
      }
      if (!slotId) {
        return { ok: false, error: '강퇴할 슬롯을 선택해 주세요.' }
      }
      try {
        const updateResult = await withTable(supabase, 'rank_room_slots', (table) =>
          supabase
            .from(table)
            .update({
              occupant_owner_id: null,
              occupant_hero_id: null,
              occupant_ready: false,
              updated_at: nowIso(),
            })
            .eq('id', slotId),
        )
        if (updateResult?.error) throw updateResult.error
        await recomputeRoomStats(selectedRoom.id)
        await touchRoom(selectedRoom.id, { hostActivity: true })
        refreshSelectedRoom()
        refreshRooms()
        return { ok: true }
      } catch (cause) {
        console.error('강퇴 실패:', cause)
        return { ok: false, error: cause.message || '강퇴하지 못했습니다.' }
      }
    },
    [refreshRooms, refreshSelectedRoom, selectedRoom, viewerId],
  )

  const claimHost = useCallback(
    async () => {
      if (!selectedRoom) {
        return { ok: false, error: '방을 선택해 주세요.' }
      }
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      if (!viewerSlot) {
        return { ok: false, error: '참여 중인 사람만 방장을 넘겨받을 수 있습니다.' }
      }
      if (!hostInactive) {
        return { ok: false, error: '방장이 아직 활동 중입니다.' }
      }
      const cutoff = new Date(Date.now() - HOST_IDLE_TIMEOUT_MS).toISOString()
      try {
        const result = await withTable(supabase, 'rank_rooms', (table) =>
          supabase
            .from(table)
            .update({ owner_id: viewerId, host_last_active_at: nowIso(), updated_at: nowIso() })
            .eq('id', selectedRoom.id)
            .lt('host_last_active_at', cutoff),
        )
        if (result?.error) throw result.error
        refreshRooms()
        refreshSelectedRoom()
        return { ok: true }
      } catch (cause) {
        console.error('방장 넘겨받기 실패:', cause)
        return { ok: false, error: cause.message || '방장을 넘겨받지 못했습니다.' }
      }
    },
    [hostInactive, refreshRooms, refreshSelectedRoom, selectedRoom, viewerId, viewerSlot],
  )

  const joinByCode = useCallback(
    async (code) => {
      if (!code) {
        return { ok: false, error: '방 코드를 입력해 주세요.' }
      }
      setJoinCodeLoading(true)
      try {
        const result = await withTable(supabase, 'rank_rooms', (table) =>
          supabase
            .from(table)
            .select(
              'id, game_id, owner_id, code, mode, status, slot_count, filled_count, ready_count, created_at, updated_at, host_last_active_at, game:rank_games(id,name,image_url,description,roles)',
            )
            .eq('code', code)
            .maybeSingle(),
        )
        if (result?.error) throw result.error
        const row = result?.data
        if (!row) {
          return { ok: false, error: '해당 코드를 가진 방이 없습니다.' }
        }
        const room = normaliseRoom(row)
        setModeState(room.mode)
        setSelectedRoom(room)
        setSlots([])
        refreshSelectedRoom()
        return { ok: true, room }
      } catch (cause) {
        console.error('방 코드 검색 실패:', cause)
        return { ok: false, error: cause.message || '방 코드를 찾지 못했습니다.' }
      } finally {
        setJoinCodeLoading(false)
      }
    },
    [refreshSelectedRoom],
  )

  const startRoom = useCallback(
    async () => {
      if (!selectedRoom) {
        return { ok: false, error: '방을 선택해 주세요.' }
      }
      if (!viewerId || selectedRoom.ownerId !== viewerId) {
        return { ok: false, error: '방장만 게임을 시작할 수 있습니다.' }
      }
      const allFilled = slots.every((slot) => slot.occupantOwnerId)
      if (!allFilled) {
        return { ok: false, error: '모든 슬롯이 가득 차야 합니다.' }
      }
      const allReady = slots.every((slot) => slot.occupantOwnerId && slot.occupantReady)
      if (!allReady) {
        return { ok: false, error: '모든 인원이 준비 완료해야 합니다.' }
      }
      setStartLoading(true)
      try {
        const result = await withTable(supabase, 'rank_rooms', (table) =>
          supabase
            .from(table)
            .update({ status: 'starting', updated_at: nowIso(), host_last_active_at: nowIso() })
            .eq('id', selectedRoom.id),
        )
        if (result?.error) throw result.error
        refreshRooms()
        refreshSelectedRoom()
        return { ok: true, room: selectedRoom }
      } catch (cause) {
        console.error('게임 시작 실패:', cause)
        return { ok: false, error: cause.message || '게임을 시작하지 못했습니다.' }
      } finally {
        setStartLoading(false)
      }
    },
    [refreshRooms, refreshSelectedRoom, selectedRoom, slots, viewerId],
  )

  const derived = useMemo(
    () => ({
      rooms,
      selectedRoom,
      slots,
      viewerSlot,
      hostInactive,
      roomLoading,
      roomDetailLoading,
      availableGames,
      gameLoading,
      createLoading,
      joinLoading,
      readyLoading,
      startLoading,
      joinCodeLoading,
      error,
      mode,
    }),
    [
      rooms,
      selectedRoom,
      slots,
      viewerSlot,
      hostInactive,
      roomLoading,
      roomDetailLoading,
      availableGames,
      gameLoading,
      createLoading,
      joinLoading,
      readyLoading,
      startLoading,
      joinCodeLoading,
      error,
      mode,
    ],
  )

  return {
    ...derived,
    viewerId,
    setMode: changeMode,
    refreshRooms,
    refreshSelectedRoom,
    selectRoomById,
    loadRoleOptions,
    createRoom,
    joinSlot,
    leaveSlot,
    toggleReady,
    kickSlot,
    claimHost,
    startRoom,
    joinByCode,
  }
}

