import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'

const SLOT_COLUMNS = 'id,game_id,hero_id,slot_no'
const GAME_COLUMNS = 'id,name,cover_path,description,owner_id,created_at'
const SESSION_COLUMNS = 'id,game_id,created_at,mode,started_by,version_id'
const HERO_LOOKUP_COLUMNS = 'id,name,image_url,ability1,ability2,ability3,ability4,owner_id'

function normaliseGame(row) {
  if (!row) return null
  return {
    id: row.id || null,
    name: row.name || '이름 없는 게임',
    cover_path: row.cover_path || null,
    description: row.description || '',
    owner_id: row.owner_id || null,
    created_at: row.created_at || null,
    image_url: row.cover_path || row.image_url || null,
  }
}

function normaliseSlot(row) {
  if (!row) return null
  return {
    id: row.id || null,
    game_id: row.game_id || null,
    hero_id: row.hero_id || null,
    slot_no: row.slot_no != null ? row.slot_no : null,
  }
}

function normaliseSession(row) {
  if (!row) return null
  return {
    id: row.id || null,
    game_id: row.game_id || null,
    created_at: row.created_at || null,
    mode: row.mode || null,
    started_by: row.started_by || null,
    version_id: row.version_id || null,
  }
}

function buildModeFrequency(sessions = []) {
  const frequency = new Map()
  sessions.forEach((session) => {
    const key = (session?.mode || '기록 없음').toLowerCase()
    frequency.set(key, (frequency.get(key) || 0) + 1)
  })
  const sorted = Array.from(frequency.entries()).sort((a, b) => b[1] - a[1])
  return sorted.length ? sorted[0][0] : null
}

function mapHeroLookup(rows = []) {
  const lookup = {}
  rows.forEach((row) => {
    if (!row?.id) return
    lookup[row.id] = {
      id: row.id,
      name: row.name || '',
      image_url: row.image_url || null,
      owner_id: row.owner_id || null,
      ability1: row.ability1 || '',
      ability2: row.ability2 || '',
      ability3: row.ability3 || '',
      ability4: row.ability4 || '',
    }
  })
  return lookup
}

export async function fetchHeroParticipationBundle(heroId, { heroSeed } = {}) {
  if (!heroId) {
    return {
      participations: [],
      scoreboardMap: {},
      heroLookup: heroSeed?.id ? { [heroSeed.id]: heroSeed } : {},
    }
  }

  const { data: heroSlotsRaw, error: heroSlotsError } = await withTable(supabase, 'game_slots', (table) =>
    supabase.from(table).select(SLOT_COLUMNS).eq('hero_id', heroId),
  )

  if (heroSlotsError) {
    throw heroSlotsError
  }

  const heroSlots = (Array.isArray(heroSlotsRaw) ? heroSlotsRaw : []).map(normaliseSlot).filter((slot) => slot?.game_id)
  const gameIds = Array.from(new Set(heroSlots.map((slot) => slot.game_id).filter(Boolean)))

  if (!gameIds.length) {
    return {
      participations: [],
      scoreboardMap: {},
      heroLookup: heroSeed?.id ? { [heroSeed.id]: heroSeed } : {},
    }
  }

  const [allSlotsResult, gamesResult, sessionsResult] = await Promise.all([
    withTable(supabase, 'game_slots', (table) =>
      supabase.from(table).select(SLOT_COLUMNS).in('game_id', gameIds),
    ),
    withTable(supabase, 'games', (table) =>
      supabase.from(table).select(GAME_COLUMNS).in('id', gameIds),
    ),
    withTable(supabase, 'game_sessions', (table) =>
      supabase
        .from(table)
        .select(SESSION_COLUMNS)
        .in('game_id', gameIds)
        .order('created_at', { ascending: false }),
    ),
  ])

  const { data: allSlotsRaw, error: allSlotsError } = allSlotsResult
  if (allSlotsError) {
    throw allSlotsError
  }

  const { data: gamesRaw, error: gamesError } = gamesResult
  if (gamesError) {
    throw gamesError
  }

  const { data: sessionsRaw, error: sessionsError } = sessionsResult
  if (sessionsError) {
    throw sessionsError
  }

  const allSlots = (Array.isArray(allSlotsRaw) ? allSlotsRaw : []).map(normaliseSlot)
  const gameMap = {}
  ;(Array.isArray(gamesRaw) ? gamesRaw : []).forEach((row) => {
    const normalised = normaliseGame(row)
    if (normalised?.id) {
      gameMap[normalised.id] = normalised
    }
  })

  const sessionsByGame = new Map()
  ;(Array.isArray(sessionsRaw) ? sessionsRaw : []).forEach((session) => {
    const normalised = normaliseSession(session)
    if (!normalised?.game_id) return
    if (!sessionsByGame.has(normalised.game_id)) {
      sessionsByGame.set(normalised.game_id, [])
    }
    sessionsByGame.get(normalised.game_id).push(normalised)
  })

  const scoreboardMap = {}
  const heroIds = new Set(heroSeed?.id ? [heroSeed.id] : [])

  allSlots.forEach((slot) => {
    if (!slot?.game_id) return
    const sessions = sessionsByGame.get(slot.game_id) || []
    if (!scoreboardMap[slot.game_id]) {
      scoreboardMap[slot.game_id] = []
    }
    scoreboardMap[slot.game_id].push({
      id: slot.id,
      game_id: slot.game_id,
      hero_id: slot.hero_id,
      slot_no: slot.slot_no,
      role: slot.slot_no != null ? `슬롯 ${slot.slot_no}` : '',
      rating: slot.slot_no != null ? slot.slot_no + 1 : null,
      battles: sessions.length || null,
    })
    if (slot.hero_id) {
      heroIds.add(slot.hero_id)
    }
  })

  let heroLookup = {}
  if (heroIds.size) {
    const { data: heroRows, error: heroError } = await withTable(supabase, 'heroes', (table) =>
      supabase
        .from(table)
        .select(HERO_LOOKUP_COLUMNS)
        .in('id', Array.from(heroIds)),
    )

    if (heroError) {
      throw heroError
    }

    heroLookup = mapHeroLookup(heroRows)
  }

  if (heroSeed?.id) {
    heroLookup[heroSeed.id] = { ...heroLookup[heroSeed.id], ...heroSeed }
  }

  const participations = heroSlots.map((slot) => {
    const sessions = sessionsByGame.get(slot.game_id) || []
    const sessionCount = sessions.length
    const latestSession = sessions[0]?.created_at || null
    const oldestSession = sessions.length ? sessions[sessions.length - 1]?.created_at : null
    const primaryMode = buildModeFrequency(sessions)

    return {
      id: slot.id,
      game_id: slot.game_id,
      hero_id: slot.hero_id,
      slot_no: slot.slot_no,
      role: slot.slot_no != null ? `슬롯 ${slot.slot_no}` : '',
      sessionCount,
      latestSessionAt: latestSession,
      firstSessionAt: oldestSession,
      primaryMode,
      game: gameMap[slot.game_id] || null,
    }
  })

  return {
    participations,
    scoreboardMap,
    heroLookup,
  }
}
