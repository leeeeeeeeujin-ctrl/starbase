import { withTable } from '@/lib/supabaseTables'

import { createNodeFromSlot } from './rules'

function normalizeSlotLayout(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return []

  return rows
    .map((row, index) => {
      const slotIndex =
        row?.slot_index != null && Number.isFinite(Number(row?.slot_index))
          ? Number(row.slot_index)
          : null

      if (slotIndex == null) return null

      const role = typeof row?.role === 'string' ? row.role.trim() : ''

      return {
        id: row?.id || null,
        role: role || null,
        slot_index: slotIndex,
        slotIndex,
        active: row?.active !== false,
        hero_id: row?.hero_id || null,
        hero_owner_id: row?.hero_owner_id || null,
        order: index,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.slot_index === b.slot_index) {
        return a.order - b.order
      }
      return a.slot_index - b.slot_index
    })
    .map(({ order, ...rest }) => rest)
}

function coerceHeroSummary(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object') return parsed
    } catch (error) {
      return null
    }
  }
  return null
}

function normalizeMatchRosterParticipants(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return []

  return rows.map((row, index) => {
    const slotIndex =
      row?.slot_index != null && Number.isFinite(Number(row.slot_index))
        ? Number(row.slot_index)
        : null
    const heroSummary = coerceHeroSummary(row?.hero_summary)
    const heroDetails = row?.heroes && typeof row.heroes === 'object' ? row.heroes : null
    const heroFallback = {
      id: row?.hero_id || null,
      name: row?.hero_name || (row?.hero_id ? '이름 없는 영웅' : ''),
      description: '',
      image_url: '',
      background_url: '',
      bgm_url: '',
      bgm_duration_seconds: null,
      ability1: '',
      ability2: '',
      ability3: '',
      ability4: '',
    }

    return {
      id: row?.id || null,
      owner_id: row?.owner_id || row?.ownerId || null,
      role: row?.role || '',
      status: row?.status || 'alive',
      slot_no: slotIndex,
      hero_id: row?.hero_id || null,
      score: Number.isFinite(Number(row?.score)) ? Number(row.score) : null,
      rating: Number.isFinite(Number(row?.rating)) ? Number(row.rating) : null,
      battles: Number.isFinite(Number(row?.battles)) ? Number(row.battles) : null,
      win_rate:
        row?.win_rate !== undefined && row?.win_rate !== null ? Number(row.win_rate) : null,
      match_source: row?.match_source || row?.matchSource || null,
      standin: row?.standin === true,
      heroes: heroSummary || heroDetails || heroFallback,
      joined_at: row?.joined_at || row?.joinedAt || null,
      ready: row?.ready === true,
      _stagedOrder: index,
    }
  })
}

function normalizeMatchRosterSlotLayout(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return []

  return rows
    .map((row, index) => {
      const slotIndex =
        row?.slot_index != null && Number.isFinite(Number(row.slot_index))
          ? Number(row.slot_index)
          : null
      if (slotIndex == null) return null
      const role = typeof row?.role === 'string' ? row.role.trim() : ''
      return {
        id: row?.slot_id || row?.id || null,
        slot_index: slotIndex,
        slotIndex,
        role: role || null,
        hero_id: row?.hero_id || null,
        hero_owner_id: row?.owner_id || null,
        active: true,
        ready: row?.ready === true,
        order: index,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.slot_index === b.slot_index) {
        return a.order - b.order
      }
      return a.slot_index - b.slot_index
    })
    .map(({ order, ...rest }) => rest)
}

function normalizeParticipants(rows = []) {
  const mapped = rows.map((row, index) => {
    const hero = row?.heroes || {}
    return {
      id: row?.id,
      owner_id: row?.owner_id || row?.ownerId || null,
      ownerId: row?.owner_id || row?.ownerId || null,
      role: row?.role || '',
      status: row?.status || 'alive',
      slot_no:
        row?.slot_no != null && Number.isFinite(Number(row?.slot_no))
          ? Number(row.slot_no)
          : null,
      score: Number(row?.score) || 0,
      rating: Number(row?.rating) || 0,
      battles: Number(row?.battles) || 0,
      win_rate:
        row?.win_rate !== undefined && row?.win_rate !== null
          ? Number(row.win_rate)
          : null,
      hero_id: row?.hero_id || null,
      match_source: row?.match_source || row?.matchSource || (row?.standin ? 'participant_pool' : 'realtime_queue'),
      standin: Boolean(row?.standin || row?.simulated || (row?.match_source || row?.matchSource) === 'participant_pool'),
      hero: {
        id: hero?.id || row?.hero_id || null,
        name: hero?.name || '이름 없는 영웅',
        description: hero?.description || '',
        image_url: hero?.image_url || '',
        background_url: hero?.background_url || '',
        bgm_url: hero?.bgm_url || '',
        bgm_duration_seconds: Number(hero?.bgm_duration_seconds) || null,
        ability1: hero?.ability1 || '',
        ability2: hero?.ability2 || '',
        ability3: hero?.ability3 || '',
        ability4: hero?.ability4 || '',
      },
      _originalIndex: index,
    }
  })

  return mapped
    .sort((a, b) => {
      const aSlot = a.slot_no
      const bSlot = b.slot_no
      if (aSlot != null && bSlot != null) {
        if (aSlot === bSlot) return a._originalIndex - b._originalIndex
        return aSlot - bSlot
      }
      if (aSlot != null) return -1
      if (bSlot != null) return 1
      return a._originalIndex - b._originalIndex
    })
    .map(({ _originalIndex, ...rest }) => rest)
}

function mapBridgeRow(bridge) {
  return {
    id: String(bridge.id),
    from: bridge.from_slot_id ? String(bridge.from_slot_id) : '',
    to: bridge.to_slot_id ? String(bridge.to_slot_id) : '',
    data: {
      trigger_words: bridge.trigger_words || [],
      conditions: bridge.conditions || [],
      priority: bridge.priority ?? 0,
      probability: bridge.probability ?? 1,
      fallback: !!bridge.fallback,
      action: bridge.action || 'continue',
    },
  }
}

function toTrimmedString(value) {
  if (value === undefined || value === null) return ''
  const trimmed = String(value).trim()
  return trimmed
}

function parseSlotIndex(value, fallbackIndex = null) {
  if (value === undefined || value === null) {
    return fallbackIndex
  }
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return numeric
  }
  return fallbackIndex
}

function buildParticipantsFromRosterSnapshot(roster = []) {
  if (!Array.isArray(roster) || roster.length === 0) {
    return []
  }

  return roster
    .map((entry, index) => {
      if (!entry) return null

      const ownerId = toTrimmedString(entry.ownerId)
      const heroId = toTrimmedString(entry.heroId)

      if (!ownerId || !heroId) {
        return null
      }

      const slotIndex = parseSlotIndex(entry.slotIndex, index)
      const heroName =
        typeof entry.heroName === 'string' && entry.heroName.trim()
          ? entry.heroName.trim()
          : ''

      return {
        id: `roster-${slotIndex != null ? slotIndex : index}-${ownerId}`,
        owner_id: ownerId,
        ownerId,
        role:
          typeof entry.role === 'string' && entry.role.trim()
            ? entry.role.trim()
            : '',
        status: entry.ready ? 'ready' : 'alive',
        slot_no: slotIndex,
        slotIndex,
        slot_index: slotIndex,
        score: 0,
        rating: 0,
        battles: 0,
        win_rate: null,
        hero_id: heroId,
        match_source: 'room_roster',
        standin: false,
        heroes: {
          id: heroId,
          name: heroName || (heroId ? `캐릭터 #${heroId}` : '알 수 없는 영웅'),
          description: '',
          image_url: '',
          background_url: '',
          bgm_url: '',
          bgm_duration_seconds: null,
          ability1: '',
          ability2: '',
          ability3: '',
          ability4: '',
        },
        joined_at: entry.joinedAt || null,
        ready: !!entry.ready,
      }
    })
    .filter(Boolean)
}

function buildSlotLayoutFromRosterSnapshot(roster = []) {
  if (!Array.isArray(roster) || roster.length === 0) {
    return []
  }

  return roster
    .map((entry, index) => {
      if (!entry) return null

      const slotIndex = parseSlotIndex(entry.slotIndex, index)
      if (slotIndex == null) {
        return null
      }

      const role =
        typeof entry.role === 'string' && entry.role.trim()
          ? entry.role.trim()
          : null

      return {
        id: entry.slotId || null,
        slot_index: slotIndex,
        slotIndex,
        role,
        hero_id: toTrimmedString(entry.heroId) || null,
        hero_owner_id: toTrimmedString(entry.ownerId) || null,
        active: true,
        ready: !!entry.ready,
        order: index,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.slot_index === b.slot_index) {
        return a.order - b.order
      }
      return a.slot_index - b.slot_index
    })
    .map(({ order, ...rest }) => rest)
}

export async function loadGameBundle(
  supabaseClient,
  gameId,
  { rosterSnapshot = [], matchInstanceId = null, roomId = null } = {},
) {
  const {
    data: gameRow,
    error: gameError,
  } = await withTable(supabaseClient, 'rank_games', (table) =>
    supabaseClient.from(table).select('*').eq('id', gameId).single(),
  )

  if (gameError) throw gameError

  const trimmedInstanceId =
    matchInstanceId && typeof matchInstanceId === 'string'
      ? matchInstanceId.trim()
      : ''
  const trimmedRoomId = roomId && typeof roomId === 'string' ? roomId.trim() : ''

  let stagedRosterRows = []
  if (trimmedInstanceId || trimmedRoomId) {
    try {
      const rosterResult = await withTable(
        supabaseClient,
        'rank_match_roster',
        (table) => {
          let query = supabaseClient
            .from(table)
            .select(
              'id, match_instance_id, room_id, slot_index, slot_id, role, owner_id, hero_id, hero_name, hero_summary, ready, joined_at, score, rating, battles, win_rate, status, standin, match_source, heroes:hero_id(id,name,description,image_url,background_url,bgm_url,bgm_duration_seconds,ability1,ability2,ability3,ability4)',
            )
            .eq('game_id', gameId)
            .order('slot_index', { ascending: true })

          if (trimmedInstanceId) {
            query = query.eq('match_instance_id', trimmedInstanceId)
          } else if (trimmedRoomId) {
            query = query.eq('room_id', trimmedRoomId)
          }

          return query
        },
      )

      if (!rosterResult.error && Array.isArray(rosterResult.data)) {
        stagedRosterRows = rosterResult.data
      }
    } catch (error) {
      console.warn('[StartClient] 매치 로스터를 불러오지 못했습니다:', error)
    }
  }

  let stagedSlotLayout = []
  let participants = []

  if (stagedRosterRows.length) {
    const normalizedStageRows = normalizeMatchRosterParticipants(stagedRosterRows)
    stagedSlotLayout = normalizeMatchRosterSlotLayout(stagedRosterRows)
    participants = normalizeParticipants(normalizedStageRows)
  } else if (Array.isArray(rosterSnapshot) && rosterSnapshot.length) {
    const rosterParticipants = buildParticipantsFromRosterSnapshot(rosterSnapshot)
    participants = normalizeParticipants(rosterParticipants)
    stagedSlotLayout = buildSlotLayoutFromRosterSnapshot(rosterSnapshot)
  } else {
    participants = []
  }

  let slotLayout = []
  try {
    const slotResult = await withTable(
      supabaseClient,
      'rank_game_slots',
      (table) =>
        supabaseClient
          .from(table)
          .select('id, slot_index, role, active, hero_id, hero_owner_id')
          .eq('game_id', gameId)
          .order('slot_index'),
    )
    if (!slotResult?.error && Array.isArray(slotResult?.data)) {
      slotLayout = normalizeSlotLayout(slotResult.data)
    }
  } catch (error) {
    console.warn('[StartClient] 슬롯 레이아웃을 불러오지 못했습니다:', error)
    slotLayout = []
  }

  if (stagedSlotLayout.length) {
    if (slotLayout.length) {
      const stagedMap = new Map()
      stagedSlotLayout.forEach((entry) => {
        stagedMap.set(entry.slot_index, entry)
      })
      slotLayout = slotLayout.map((slot) => {
        const staged = stagedMap.get(slot.slot_index)
        if (!staged) return slot
        return {
          ...slot,
          hero_id: staged.hero_id || slot.hero_id || null,
          hero_owner_id: staged.hero_owner_id || slot.hero_owner_id || null,
          ready: staged.ready ?? slot.ready,
        }
      })
    } else {
      slotLayout = stagedSlotLayout
    }
  }
  const graph = { nodes: [], edges: [] }
  const warnings = []

  if (gameRow?.prompt_set_id) {
    const [
      { data: slotRows, error: slotError },
      { data: bridgeRows, error: bridgeError },
    ] = await Promise.all([
      withTable(supabaseClient, 'prompt_slots', (table) =>
        supabaseClient
          .from(table)
          .select('*')
          .eq('set_id', gameRow.prompt_set_id)
          .order('slot_no')
      ),
      withTable(supabaseClient, 'prompt_bridges', (table) =>
        supabaseClient
          .from(table)
          .select('*')
          .eq('from_set', gameRow.prompt_set_id)
      ),
    ])

    if (slotError) throw slotError
    if (bridgeError) throw bridgeError

    const nodeResults = (slotRows || []).map((slot) => createNodeFromSlot(slot))
    graph.nodes = nodeResults.map((node) => {
      if (Array.isArray(node?.warnings) && node.warnings.length) {
        warnings.push(...node.warnings)
      }
      const { warnings: _warnings, ...rest } = node
      return rest
    })
    graph.edges = (bridgeRows || []).map(mapBridgeRow).filter((edge) => edge.from && edge.to)
  }

  return { game: gameRow, participants, slotLayout, graph, warnings }
}

//
