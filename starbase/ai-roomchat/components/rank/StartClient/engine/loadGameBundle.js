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

export async function loadGameBundle(supabaseClient, gameId) {
  const {
    data: gameRow,
    error: gameError,
  } = await withTable(supabaseClient, 'rank_games', (table) =>
    supabaseClient.from(table).select('*').eq('id', gameId).single()
  )

  if (gameError) throw gameError

  const {
    data: participantRows,
    error: participantError,
  } = await withTable(supabaseClient, 'rank_participants', (table) =>
    supabaseClient
      .from(table)
      .select(
        'id, owner_id, role, status, slot_no, hero_id, score, rating, battles, win_rate, heroes:hero_id(id,name,description,image_url,background_url,bgm_url,bgm_duration_seconds,ability1,ability2,ability3,ability4)'
      )
      .eq('game_id', gameId)
  )

  if (participantError) throw participantError

  const participants = normalizeParticipants(participantRows || [])
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
