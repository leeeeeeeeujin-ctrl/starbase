import { withTable } from '@/lib/supabaseTables'

import { createNodeFromSlot } from './rules'

function normalizeParticipants(rows = []) {
  return rows.map((row) => {
    const hero = row?.heroes || {}
    return {
      id: row?.id,
      role: row?.role || '',
      status: row?.status || 'alive',
      score: Number(row?.score) || 0,
      rating: Number(row?.rating) || 0,
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
    }
  })
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
        'id, role, status, hero_id, score, rating, heroes:hero_id(id,name,description,image_url,background_url,bgm_url,bgm_duration_seconds,ability1,ability2,ability3,ability4)'
      )
      .eq('game_id', gameId)
  )

  if (participantError) throw participantError

  const participants = normalizeParticipants(participantRows || [])
  const graph = { nodes: [], edges: [] }

  if (gameRow?.prompt_set_id) {
    const [{ data: slotRows, error: slotError }, { data: bridgeRows, error: bridgeError }] = await Promise.all([
      supabaseClient
        .from('prompt_slots')
        .select('*')
        .eq('set_id', gameRow.prompt_set_id)
        .order('slot_no'),
      supabaseClient
        .from('prompt_bridges')
        .select('*')
        .eq('from_set', gameRow.prompt_set_id),
    ])

    if (slotError) throw slotError
    if (bridgeError) throw bridgeError

    graph.nodes = (slotRows || []).map((slot) => createNodeFromSlot(slot))
    graph.edges = (bridgeRows || []).map(mapBridgeRow).filter((edge) => edge.from && edge.to)
  }

  return { game: gameRow, participants, graph }
}

//
