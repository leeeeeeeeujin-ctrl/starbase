import { withTable } from '@/lib/supabaseTables'

import { createNodeFromSlot } from './rules'

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizeHeroAudioProfile(raw) {
  if (!raw) return null

  let payload = raw
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw)
    } catch (error) {
      console.warn('Failed to parse hero audio profile JSON:', error)
      return null
    }
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const profile = {}

  if (typeof payload.eqEnabled === 'boolean') {
    profile.eqEnabled = payload.eqEnabled
  }

  if (payload.equalizer && typeof payload.equalizer === 'object') {
    const eq = {}
    const low = toNumber(payload.equalizer.low)
    const mid = toNumber(payload.equalizer.mid)
    const high = toNumber(payload.equalizer.high)
    if (low != null) eq.low = low
    if (mid != null) eq.mid = mid
    if (high != null) eq.high = high
    if (Object.keys(eq).length) {
      profile.equalizer = eq
    }
  }

  if (typeof payload.reverbEnabled === 'boolean') {
    profile.reverbEnabled = payload.reverbEnabled
  }

  if (payload.reverbDetail && typeof payload.reverbDetail === 'object') {
    const mix = toNumber(payload.reverbDetail.mix)
    const decay = toNumber(payload.reverbDetail.decay)
    const detail = {}
    if (mix != null) detail.mix = mix
    if (decay != null) detail.decay = decay
    if (Object.keys(detail).length) {
      profile.reverbDetail = detail
    }
  }

  if (typeof payload.compressorEnabled === 'boolean') {
    profile.compressorEnabled = payload.compressorEnabled
  }

  if (payload.compressorDetail && typeof payload.compressorDetail === 'object') {
    const threshold = toNumber(payload.compressorDetail.threshold)
    const ratio = toNumber(payload.compressorDetail.ratio)
    const release = toNumber(payload.compressorDetail.release)
    const detail = {}
    if (threshold != null) detail.threshold = threshold
    if (ratio != null) detail.ratio = ratio
    if (release != null) detail.release = release
    if (Object.keys(detail).length) {
      profile.compressorDetail = detail
    }
  }

  return Object.keys(profile).length ? profile : null
}

function mapHeroRow(row, fallbackId) {
  const id = row?.id || fallbackId || null
  const audioProfile =
    normalizeHeroAudioProfile(
      row?.audio_settings ?? row?.audio_profile ?? row?.audioProfile ?? row?.bgm_settings ?? null,
    ) || null

  return {
    id,
    name: row?.name || '이름 없는 영웅',
    description: row?.description || '',
    ability1: row?.ability1 || '',
    ability2: row?.ability2 || '',
    ability3: row?.ability3 || '',
    ability4: row?.ability4 || '',
    image_url: row?.image_url || '',
    background_url: row?.background_url || '',
    bgm_url: row?.bgm_url || '',
    bgm_duration_seconds: row?.bgm_duration_seconds || null,
    bgm_mime: row?.bgm_mime || null,
    audioProfile,
  }
}

function normalizeParticipants(rows = []) {
  return rows.map((row) => {
    const hero = mapHeroRow(row?.heroes, row?.hero_id)
    return {
      id: row?.id,
      role: row?.role || '',
      status: row?.status || 'alive',
      score: Number(row?.score) || 0,
      rating: Number(row?.rating) || 0,
      hero_id: row?.hero_id || null,
      hero,
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
      .select('id, role, status, hero_id, score, rating, heroes:hero_id(*)')
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
