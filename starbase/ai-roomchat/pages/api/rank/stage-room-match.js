import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withTableQuery } from '@/lib/supabaseTables'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for stage-room-match API')
}

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
})

function toTrimmedString(value) {
  if (value === null || value === undefined) return ''
  const trimmed = String(value).trim()
  return trimmed
}

function toOptionalTrimmedString(value) {
  const trimmed = toTrimmedString(value)
  return trimmed ? trimmed : null
}

function toNumericOrNull(value) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return numeric
}

function toNumericVersion(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fallback
    return Math.trunc(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return fallback
    const numericFromString = Number(trimmed)
    if (Number.isFinite(numericFromString)) {
      return Math.trunc(numericFromString)
    }
    const parsed = Date.parse(trimmed)
    if (!Number.isNaN(parsed)) {
      return Math.trunc(parsed)
    }
    return fallback
  }
  if (value instanceof Date) {
    const time = value.getTime()
    if (!Number.isFinite(time)) return fallback
    return Math.trunc(time)
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.trunc(numeric)
}

function isMissingRpcError(error, name) {
  if (!error) return false
  const text = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return text.includes(name.toLowerCase()) && text.includes('does not exist')
}

function toSlotIndex(value, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback
  }
  return numeric
}

function normalizeRosterEntries(entries = []) {
  if (!Array.isArray(entries)) return []
  return entries
    .map((entry, index) => {
      if (!entry) return null
      const standinPlaceholder =
        entry.standinPlaceholder === true ||
        entry.standin_placeholder === true ||
        entry.placeholder === true ||
        (typeof entry.matchSource === 'string' && entry.matchSource.trim() === 'async_standin_placeholder')

      const placeholderOwnerId = toOptionalTrimmedString(
        entry.placeholderOwnerId ?? entry.placeholder_owner_id ?? null,
      )
      const slotIndex = toSlotIndex(
        entry.slotIndex ?? entry.slot_index ?? entry.slotNo ?? entry.slot_no,
        index,
      )
      const role = toTrimmedString(entry.role ?? entry.roleName)
      const ownerIdRaw =
        entry.ownerId ?? entry.owner_id ?? entry.occupantOwnerId ?? entry.ownerID
      const ownerId = standinPlaceholder
        ? null
        : toOptionalTrimmedString(ownerIdRaw)
      const heroId = toOptionalTrimmedString(
        entry.heroId ?? entry.hero_id ?? entry.occupantHeroId ?? entry.heroID,
      )
      const slotId = toOptionalTrimmedString(entry.slotId ?? entry.slot_id ?? entry.id)
      const heroName = toTrimmedString(entry.heroName ?? entry.hero_name)
      const ready = Boolean(entry.ready ?? entry.isReady ?? entry.occupantReady)
      const joinedAt = entry.joinedAt ?? entry.joined_at ?? null
      const standin = entry.standin === true || entry.isStandin === true
      const matchSource =
        toOptionalTrimmedString(entry.matchSource ?? entry.match_source) ||
        (standin ? 'async_standin' : null)
      const score = toNumericOrNull(entry.score ?? entry.standinScore)
      const rating = toNumericOrNull(entry.rating ?? entry.standinRating)
      const battles = toNumericOrNull(entry.battles ?? entry.standinBattles)
      const winRateRaw = entry.winRate ?? entry.win_rate ?? entry.standinWinRate
      const winRate =
        winRateRaw !== null && winRateRaw !== undefined && Number.isFinite(Number(winRateRaw))
          ? Number(winRateRaw)
          : null
      const status =
        toOptionalTrimmedString(entry.status ?? entry.standinStatus) ||
        (standin ? 'standin' : null)

      return {
        slotIndex,
        slotId,
        role: role || '역할 미지정',
        ownerId,
        placeholderOwnerId,
        heroId,
        heroName: heroName || null,
        ready,
        joinedAt,
        standin,
        matchSource,
        standinPlaceholder,
        score,
        rating,
        battles,
        winRate,
        status,
      }
    })
    .filter((entry) => entry && entry.slotIndex != null)
    .sort((a, b) => a.slotIndex - b.slotIndex)
}

function buildHeroSummary(row) {
  if (!row) return null
  const summary = {
    id: row.id || null,
    name: row.name || '',
    description: row.description || '',
    image_url: row.image_url || '',
    background_url: row.background_url || '',
    bgm_url: row.bgm_url || '',
    bgm_duration_seconds: Number(row.bgm_duration_seconds) || null,
    ability1: row.ability1 || '',
    ability2: row.ability2 || '',
    ability3: row.ability3 || '',
    ability4: row.ability4 || '',
  }
  return summary
}

function parseBody(req) {
  let payload = req.body
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}')
    } catch (error) {
      return { error: 'invalid_payload' }
    }
  }
  if (!payload || typeof payload !== 'object') {
    return { error: 'invalid_payload' }
  }
  return { payload }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { data: userData, error: userError } = await anonClient.auth.getUser(token)
  const user = userData?.user || null
  if (userError || !user) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { payload, error } = parseBody(req)
  if (error) {
    return res.status(400).json({ error })
  }

  const matchInstanceId = toOptionalTrimmedString(payload.match_instance_id || payload.matchInstanceId)
  const roomId = toOptionalTrimmedString(payload.room_id || payload.roomId)
  const gameId = toOptionalTrimmedString(payload.game_id || payload.gameId)
  const rosterEntries = normalizeRosterEntries(payload.roster)
  const heroMap = payload.hero_map && typeof payload.hero_map === 'object' ? payload.hero_map : {}

  if (!matchInstanceId) {
    return res.status(400).json({ error: 'missing_match_instance_id' })
  }
  if (!roomId) {
    return res.status(400).json({ error: 'missing_room_id' })
  }
  if (!gameId) {
    return res.status(400).json({ error: 'missing_game_id' })
  }
  if (!rosterEntries.length) {
    return res.status(400).json({ error: 'empty_roster' })
  }

  const ownerIds = Array.from(new Set(rosterEntries.map((entry) => entry.ownerId).filter(Boolean)))
  const heroIds = Array.from(new Set(rosterEntries.map((entry) => entry.heroId).filter(Boolean)))

  let participantRows = []
  if (ownerIds.length) {
    const { data, error: participantError } = await withTableQuery(
      supabaseAdmin,
      'rank_participants',
      (from) =>
        from
          .select(
            'owner_id, hero_id, score, rating, battles, win_rate, status, standin, match_source',
          )
          .eq('game_id', gameId)
          .in('owner_id', ownerIds),
    )
    if (participantError) {
      return res.status(400).json({ error: participantError.message })
    }
    participantRows = Array.isArray(data) ? data : []
  }

  let heroRows = []
  if (heroIds.length) {
    const { data, error: heroError } = await withTableQuery(supabaseAdmin, 'heroes', (from) =>
      from
        .select(
          'id, name, description, image_url, background_url, bgm_url, bgm_duration_seconds, ability1, ability2, ability3, ability4',
        )
        .in('id', heroIds),
    )
    if (heroError) {
      return res.status(400).json({ error: heroError.message })
    }
    heroRows = Array.isArray(data) ? data : []
  }

  const participantMap = new Map()
  participantRows.forEach((row) => {
    const key = toOptionalTrimmedString(row?.owner_id)
    if (!key) return
    participantMap.set(key, {
      score: Number.isFinite(Number(row?.score)) ? Number(row.score) : null,
      rating: Number.isFinite(Number(row?.rating)) ? Number(row.rating) : null,
      battles: Number.isFinite(Number(row?.battles)) ? Number(row.battles) : null,
      win_rate:
        row?.win_rate !== undefined && row?.win_rate !== null ? Number(row.win_rate) : null,
      status: toOptionalTrimmedString(row?.status),
      standin: row?.standin === true,
      match_source: toOptionalTrimmedString(row?.match_source),
    })
  })

  const heroSummaryMap = new Map()
  heroRows.forEach((row) => {
    const key = toOptionalTrimmedString(row?.id)
    if (!key) return
    heroSummaryMap.set(key, buildHeroSummary(row))
  })

  const now = new Date().toISOString()
  const insertRows = rosterEntries.map((entry) => {
    const stats = participantMap.get(entry.ownerId || '') || {}
    const heroMeta = heroSummaryMap.get(entry.heroId || '') || heroMap[entry.heroId || ''] || null
    const heroName = heroMeta?.name || entry.heroName || null
    const entryStandin = entry.standin === true
    const entryMatchSource = entry.matchSource || (entryStandin ? 'async_standin' : null)
    const entryScore = toNumericOrNull(entry.score)
    const entryRating = toNumericOrNull(entry.rating)
    const entryBattles = toNumericOrNull(entry.battles)
    const entryWinRate = entry.winRate !== undefined && entry.winRate !== null ? Number(entry.winRate) : null
    const entryStatus = entry.status || (entryStandin ? 'standin' : null)
    const derivedMatchSource =
      toOptionalTrimmedString(stats.match_source) ||
      toOptionalTrimmedString(entryMatchSource) ||
      null
    const derivedStatus =
      toOptionalTrimmedString(stats.status) ||
      toOptionalTrimmedString(entryStatus) ||
      (entryStandin ? 'standin' : null)

    return {
      match_instance_id: matchInstanceId,
      room_id: roomId,
      game_id: gameId,
      slot_index: entry.slotIndex,
      slot_id: entry.slotId,
      role: entry.role,
      owner_id: entry.ownerId,
      hero_id: entry.heroId,
      hero_name: heroName,
      hero_summary: heroMeta,
      ready: entry.ready,
      joined_at: entry.joinedAt,
      score: stats.score ?? entryScore ?? null,
      rating: stats.rating ?? entryRating ?? null,
      battles: stats.battles ?? entryBattles ?? null,
      win_rate: stats.win_rate ?? (Number.isFinite(entryWinRate) ? entryWinRate : null),
      status: derivedStatus,
      standin: stats.standin === true || entryStandin,
      match_source: derivedMatchSource,
      created_at: now,
      updated_at: now,
    }
  })

  const slotTemplatePayload =
    payload.slot_template && typeof payload.slot_template === 'object' ? payload.slot_template : {}

  const verificationRoles = Array.isArray(slotTemplatePayload.roles)
    ? slotTemplatePayload.roles
    : Array.isArray(payload.roles)
    ? payload.roles
    : []
  const verificationSlots = Array.isArray(slotTemplatePayload.slots)
    ? slotTemplatePayload.slots
    : Array.isArray(slotTemplatePayload.slot_map)
    ? slotTemplatePayload.slot_map
    : Array.isArray(payload.slots)
    ? payload.slots
    : []

  if (verificationSlots.length) {
    const { error: verifyError } = await supabaseAdmin.rpc('verify_rank_roles_and_slots', {
      p_roles: verificationRoles,
      p_slots: verificationSlots,
    })

    if (verifyError && !isMissingRpcError(verifyError, 'verify_rank_roles_and_slots')) {
      return res.status(400).json({
        error: 'roles_slots_invalid',
        detail: verifyError.details || verifyError.message || null,
      })
    }
  }

  const slotTemplateVersion = toNumericVersion(
    slotTemplatePayload.version ??
      slotTemplatePayload.version_ms ??
      slotTemplatePayload.updatedAt ??
      slotTemplatePayload.updated_at,
    Date.now(),
  )

  const slotTemplateSource =
    toOptionalTrimmedString(slotTemplatePayload.source ?? slotTemplatePayload.origin) || 'room-stage'

  const updatedAtRaw =
    slotTemplatePayload.updated_at ??
    slotTemplatePayload.updatedAt ??
    (Number.isFinite(slotTemplateVersion) ? new Date(slotTemplateVersion).toISOString() : null)

  let slotTemplateUpdatedAt
  if (typeof updatedAtRaw === 'string') {
    const parsed = new Date(updatedAtRaw)
    slotTemplateUpdatedAt = Number.isNaN(parsed.getTime()) ? new Date(slotTemplateVersion).toISOString() : parsed.toISOString()
  } else if (Number.isFinite(Number(updatedAtRaw))) {
    slotTemplateUpdatedAt = new Date(Number(updatedAtRaw)).toISOString()
  } else if (Number.isFinite(slotTemplateVersion)) {
    slotTemplateUpdatedAt = new Date(slotTemplateVersion).toISOString()
  } else {
    slotTemplateUpdatedAt = now
  }

  const rpcPayload = {
    p_room_id: roomId,
    p_game_id: gameId,
    p_match_instance_id: matchInstanceId,
    p_slot_template_version: slotTemplateVersion,
    p_slot_template_source: slotTemplateSource,
    p_slot_template_updated_at: slotTemplateUpdatedAt,
    p_roster: insertRows,
  }

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('sync_rank_match_roster', rpcPayload)

  if (rpcError) {
    const message = rpcError.message || 'sync_failed'
    if (message.includes('slot_version_conflict')) {
      return res.status(409).json({ error: 'slot_version_conflict' })
    }
    if (message.includes('empty_roster')) {
      return res.status(400).json({ error: 'empty_roster' })
    }
    return res.status(400).json({ error: message })
  }

  const summary = Array.isArray(rpcData) && rpcData.length ? rpcData[0] : null

  return res.status(200).json({
    ok: true,
    staged: summary?.inserted_count ?? insertRows.length,
    slot_template_version: summary?.slot_template_version ?? slotTemplateVersion,
    slot_template_updated_at: summary?.slot_template_updated_at ?? slotTemplateUpdatedAt,
  })
}
