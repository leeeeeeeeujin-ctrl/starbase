import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'

const SLOT_COLUMNS = 'id,game_id,hero_id,slot_index,role'
const GAME_COLUMNS = 'id,name,image_url,description,owner_id,created_at'
const SESSION_COLUMNS = 'id,game_id,created_at,mode,started_by,version_id'
const HERO_LOOKUP_COLUMNS =
  'id,name,image_url,description,ability1,ability2,ability3,ability4,background_url,bgm_url,bgm_mime,bgm_duration_seconds,owner_id'
const PARTICIPANT_COLUMNS =
  'id,game_id,hero_id,owner_id,slot_no,role,rating,score,battles,created_at,updated_at'
const SCOREBOARD_PARTICIPANT_COLUMNS =
  'id,game_id,hero_id,owner_id,slot_no,role,rating,score,battles,created_at,updated_at'

function normaliseGame(row) {
  if (!row) return null
  return {
    id: row.id || null,
    name: row.name || '이름 없는 게임',
    cover_path: row.cover_path || null,
    description: row.description || '',
    owner_id: row.owner_id || null,
    created_at: row.created_at || null,
    image_url: row.image_url || row.cover_path || null,
  }
}

function normaliseSlot(row) {
  if (!row) return null
  return {
    id: row.id || null,
    game_id: row.game_id || null,
    hero_id: row.hero_id || null,
    slot_no: row.slot_index != null ? row.slot_index : null,
    role: row.role || null,
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

function normaliseParticipant(row) {
  if (!row) return null
  return {
    id: row.id || null,
    game_id: row.game_id || null,
    hero_id: row.hero_id || null,
    owner_id: row.owner_id || null,
    slot_no: row.slot_no != null ? row.slot_no : null,
    role: row.role || null,
    rating: row.rating != null ? Number(row.rating) : null,
    score: row.score != null ? Number(row.score) : null,
    battles: row.battles != null ? Number(row.battles) : null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
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
      description: row.description || '',
      owner_id: row.owner_id || null,
      ability1: row.ability1 || '',
      ability2: row.ability2 || '',
      ability3: row.ability3 || '',
      ability4: row.ability4 || '',
      background_url: row.background_url || null,
      bgm_url: row.bgm_url || null,
      bgm_mime: row.bgm_mime || null,
      bgm_duration_seconds: row.bgm_duration_seconds || null,
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

  const [heroSlotsResult, heroParticipantsResult] = await Promise.all([
    withTable(supabase, 'rank_game_slots', (table) =>
      supabase.from(table).select(SLOT_COLUMNS).eq('hero_id', heroId),
    ),
    withTable(supabase, 'rank_participants', (table) =>
      supabase.from(table).select(PARTICIPANT_COLUMNS).eq('hero_id', heroId),
    ),
  ])

  const { data: heroSlotsRaw, error: heroSlotsError } = heroSlotsResult
  if (heroSlotsError) {
    throw heroSlotsError
  }

  const { data: heroParticipantsRaw, error: heroParticipantsError } = heroParticipantsResult
  if (heroParticipantsError) {
    throw heroParticipantsError
  }

  const heroSlots = (Array.isArray(heroSlotsRaw) ? heroSlotsRaw : [])
    .map(normaliseSlot)
    .filter((slot) => slot?.game_id)

  const heroParticipants = (Array.isArray(heroParticipantsRaw) ? heroParticipantsRaw : [])
    .map(normaliseParticipant)
    .filter((participant) => participant?.game_id)

  const heroParticipantByGame = new Map()
  heroParticipants.forEach((participant) => {
    if (participant?.game_id) {
      heroParticipantByGame.set(participant.game_id, participant)
    }
  })

  const participantSlots = heroParticipants.map((participant) => ({
    id: participant?.id || null,
    game_id: participant?.game_id || null,
    hero_id: participant?.hero_id || null,
    slot_no: participant?.slot_no != null ? participant.slot_no : null,
    role: participant?.role || null,
  }))

  const slotByGame = new Map()
  heroSlots.forEach((slot) => {
    if (slot?.game_id) {
      slotByGame.set(slot.game_id, slot)
    }
  })

  participantSlots.forEach((slot) => {
    if (!slot?.game_id) {
      return
    }

    if (slotByGame.has(slot.game_id)) {
      const existing = slotByGame.get(slot.game_id)
      slotByGame.set(slot.game_id, {
        ...existing,
        slot_no: existing?.slot_no != null ? existing.slot_no : slot.slot_no,
        role:
          (existing?.role && typeof existing.role === 'string' ? existing.role.trim() : '') ||
          (slot.role && typeof slot.role === 'string' ? slot.role.trim() : '') ||
          (slot.slot_no != null ? `슬롯 ${slot.slot_no}` : existing?.role || null),
      })
      return
    }

    slotByGame.set(slot.game_id, slot)
  })

  const heroParticipationSlots = Array.from(slotByGame.values())

  const gameIds = Array.from(
    new Set([
      ...heroParticipationSlots.map((slot) => slot.game_id).filter(Boolean),
      ...heroParticipants.map((row) => row?.game_id).filter(Boolean),
    ]),
  )

  if (!gameIds.length) {
    return {
      participations: [],
      scoreboardMap: {},
      heroLookup: heroSeed?.id ? { [heroSeed.id]: heroSeed } : {},
    }
  }

  const [allSlotsResult, gamesResult, sessionsResult, gameParticipantsResult] = await Promise.all([
    withTable(supabase, 'rank_game_slots', (table) =>
      supabase.from(table).select(SLOT_COLUMNS).in('game_id', gameIds),
    ),
    withTable(supabase, 'rank_games', (table) =>
      supabase.from(table).select(GAME_COLUMNS).in('id', gameIds),
    ),
    withTable(supabase, 'game_sessions', (table) =>
      supabase
        .from(table)
        .select(SESSION_COLUMNS)
        .in('game_id', gameIds)
        .order('created_at', { ascending: false }),
    ),
    withTable(supabase, 'rank_participants', (table) =>
      supabase.from(table).select(SCOREBOARD_PARTICIPANT_COLUMNS).in('game_id', gameIds),
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

  const { data: allParticipantsRaw, error: allParticipantsError } = gameParticipantsResult
  if (allParticipantsError) {
    throw allParticipantsError
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

  const participantsByGame = new Map()
  const allParticipants = (Array.isArray(allParticipantsRaw) ? allParticipantsRaw : [])
    .map(normaliseParticipant)
    .filter((participant) => participant?.game_id)

  allParticipants.forEach((participant) => {
    if (!participant?.game_id) return
    if (!participantsByGame.has(participant.game_id)) {
      participantsByGame.set(participant.game_id, [])
    }
    participantsByGame.get(participant.game_id).push({ ...participant })
  })

  const scoreboardMap = {}
  const heroIds = new Set(heroSeed?.id ? [heroSeed.id] : [])
  heroParticipants.forEach((participant) => {
    if (participant?.hero_id) {
      heroIds.add(participant.hero_id)
    }
  })

  allSlots.forEach((slot) => {
    if (!slot?.game_id) return
    const sessions = sessionsByGame.get(slot.game_id) || []
    const participants = participantsByGame.get(slot.game_id) || []
    let participantIndex = -1
    if (slot.hero_id) {
      participantIndex = participants.findIndex((entry) => entry.hero_id === slot.hero_id)
    }
    if (participantIndex === -1 && slot.slot_no != null) {
      participantIndex = participants.findIndex((entry) => entry.slot_no === slot.slot_no)
    }
    const participant = participantIndex >= 0 ? participants.splice(participantIndex, 1)[0] : null
    if (!scoreboardMap[slot.game_id]) {
      scoreboardMap[slot.game_id] = []
    }
    const battleCount =
      participant?.battles != null && Number.isFinite(Number(participant.battles))
        ? Number(participant.battles)
        : sessions.length
    const participantRole =
      participant?.role && typeof participant.role === 'string' ? participant.role.trim() : ''
    const slotRole = slot.role && typeof slot.role === 'string' ? slot.role.trim() : ''
    const fallbackRole =
      participant?.slot_no != null
        ? `슬롯 ${participant.slot_no}`
        : slot.slot_no != null
          ? `슬롯 ${slot.slot_no}`
          : ''
    const roleLabel = participantRole || slotRole || fallbackRole
    scoreboardMap[slot.game_id].push({
      id: slot.id || participant?.id || `${slot.game_id}-${slot.slot_no ?? 'slot'}`,
      game_id: slot.game_id,
      hero_id: participant?.hero_id != null ? participant.hero_id : slot.hero_id,
      slot_no: participant?.slot_no != null ? participant.slot_no : slot.slot_no,
      role: roleLabel,
      rating: participant?.rating != null ? participant.rating : null,
      score: participant?.score != null ? participant.score : null,
      battles: battleCount,
    })
    if (slot.hero_id) {
      heroIds.add(slot.hero_id)
    }
    if (participant?.hero_id) {
      heroIds.add(participant.hero_id)
    }
  })

  participantsByGame.forEach((remaining, gameId) => {
    if (!Array.isArray(remaining) || !remaining.length) return
    if (!scoreboardMap[gameId]) {
      scoreboardMap[gameId] = []
    }
    remaining.forEach((participant) => {
      const battleCount =
        participant?.battles != null && Number.isFinite(Number(participant.battles))
          ? Number(participant.battles)
          : null
      const participantRole =
        participant?.role && typeof participant.role === 'string' ? participant.role.trim() : ''
      const fallbackRole = participant.slot_no != null ? `슬롯 ${participant.slot_no}` : ''
      scoreboardMap[gameId].push({
        id: participant.id || `${gameId}-participant-${participant.slot_no ?? 'na'}`,
        game_id: participant.game_id,
        hero_id: participant.hero_id,
        slot_no: participant.slot_no,
        role: participantRole || fallbackRole,
        rating: participant.rating != null ? participant.rating : null,
        score: participant.score != null ? participant.score : null,
        battles: battleCount,
      })
      if (participant.hero_id) {
        heroIds.add(participant.hero_id)
      }
    })
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

  const participations = heroParticipationSlots.map((slot) => {
    const sessions = sessionsByGame.get(slot.game_id) || []
    const participant = heroParticipantByGame.get(slot.game_id) || null
    const participantBattles =
      participant?.battles != null && Number.isFinite(Number(participant.battles))
        ? Number(participant.battles)
        : null
    const sessionCount = participantBattles != null ? participantBattles : sessions.length
    const latestSession = sessions[0]?.created_at || null
    const oldestSession = sessions.length ? sessions[sessions.length - 1]?.created_at : null
    const primaryMode = buildModeFrequency(sessions)
    const effectiveRole = participant?.role || slot.role || (slot.slot_no != null ? `슬롯 ${slot.slot_no}` : '')
    const slotNumber = participant?.slot_no != null ? participant.slot_no : slot.slot_no

    return {
      id: slot.id,
      game_id: slot.game_id,
      hero_id: slot.hero_id,
      slot_no: slotNumber,
      role: effectiveRole,
      rating: participant?.rating != null ? participant.rating : null,
      score: participant?.score != null ? participant.score : null,
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
