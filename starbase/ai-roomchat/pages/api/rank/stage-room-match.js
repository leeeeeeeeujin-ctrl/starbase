import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withTableQuery } from '@/lib/supabaseTables'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'
import { addSupabaseDebugEvent } from '@/lib/debugCollector'

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

async function fetchRoomContext(roomId) {
  const { data, error } = await withTableQuery(
    supabaseAdmin,
    'rank_rooms',
    (from) => from.select('id, owner_id, mode').eq('id', roomId).maybeSingle(),
  )

  if (error) {
    return {
      errorResponse: {
        status: 400,
        body: { error: error.message, supabaseError: error },
      },
    }
  }

  if (!data) {
    return {
      errorResponse: {
        status: 404,
        body: { error: 'room_not_found' },
      },
    }
  }

  return {
    room: data,
    ownerId: toOptionalTrimmedString(data.owner_id),
    mode: toOptionalTrimmedString(data.mode),
  }
}

function ensureRoomOwnership(roomOwnerId, callerId) {
  if (!roomOwnerId) {
    return {
      status: 400,
      body: { error: 'room_owner_missing' },
    }
  }

  const normalizedCaller = toOptionalTrimmedString(callerId)
  if (!normalizedCaller || normalizedCaller !== roomOwnerId) {
    return {
      status: 403,
      body: { error: 'forbidden' },
    }
  }

  return null
}

function buildParticipantMap(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    const key = toOptionalTrimmedString(row?.owner_id)
    if (!key) return
    map.set(key, {
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
  return map
}

async function fetchParticipantStats(gameId, ownerIds) {
  if (!ownerIds.length) {
    return { map: new Map() }
  }

  const { data, error } = await withTableQuery(
    supabaseAdmin,
    'rank_participants',
    (from) =>
      from
        .select('owner_id, hero_id, score, rating, battles, win_rate, status, standin, match_source')
        .eq('game_id', gameId)
        .in('owner_id', ownerIds),
  )

  if (error) {
    return {
      errorResponse: {
        status: 400,
        body: { error: error.message },
      },
    }
  }

  return { map: buildParticipantMap(Array.isArray(data) ? data : []) }
}

function buildHeroSummaryMap(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    const key = toOptionalTrimmedString(row?.id)
    if (!key) return
    map.set(key, buildHeroSummary(row))
  })
  return map
}

async function fetchHeroSummaries(heroIds) {
  if (!heroIds.length) {
    return { map: new Map() }
  }

  const { data, error } = await withTableQuery(supabaseAdmin, 'heroes', (from) =>
    from
      .select(
        'id, name, description, image_url, background_url, bgm_url, bgm_duration_seconds, ability1, ability2, ability3, ability4',
      )
      .in('id', heroIds),
  )

  if (error) {
    return {
      errorResponse: {
        status: 400,
        body: { error: error.message },
      },
    }
  }

  return { map: buildHeroSummaryMap(Array.isArray(data) ? data : []) }
}

function buildRosterInsertRows({
  rosterEntries,
  participantMap,
  heroSummaryMap,
  heroPayloadMap,
  nowIso,
  matchInstanceId,
  roomId,
  gameId,
}) {
  return rosterEntries.map((entry) => {
    const stats = participantMap.get(entry.ownerId || '') || {}
    const heroMeta =
      heroSummaryMap.get(entry.heroId || '') || heroPayloadMap[entry.heroId || ''] || null
    const heroName = heroMeta?.name || entry.heroName || null
    const entryStandin = entry.standin === true
    const entryMatchSource = entry.matchSource || (entryStandin ? 'async_standin' : null)
    const entryScore = toNumericOrNull(entry.score)
    const entryRating = toNumericOrNull(entry.rating)
    const entryBattles = toNumericOrNull(entry.battles)
    const entryWinRate =
      entry.winRate !== undefined && entry.winRate !== null ? Number(entry.winRate) : null
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
      created_at: nowIso,
      updated_at: nowIso,
    }
  })
}

function normalizeSlotTemplateMetadata(slotTemplatePayload, nowIso) {
  const version = toNumericVersion(
    slotTemplatePayload.version ??
      slotTemplatePayload.version_ms ??
      slotTemplatePayload.updatedAt ??
      slotTemplatePayload.updated_at,
    Date.now(),
  )

  const source =
    toOptionalTrimmedString(slotTemplatePayload.source ?? slotTemplatePayload.origin) || 'room-stage'

  const updatedAtRaw =
    slotTemplatePayload.updated_at ??
    slotTemplatePayload.updatedAt ??
    (Number.isFinite(version) ? new Date(version).toISOString() : null)

  let updatedAtIso
  if (typeof updatedAtRaw === 'string') {
    const parsed = new Date(updatedAtRaw)
    updatedAtIso = Number.isNaN(parsed.getTime())
      ? Number.isFinite(version)
        ? new Date(version).toISOString()
        : nowIso
      : parsed.toISOString()
  } else if (Number.isFinite(Number(updatedAtRaw))) {
    updatedAtIso = new Date(Number(updatedAtRaw)).toISOString()
  } else if (Number.isFinite(version)) {
    updatedAtIso = new Date(version).toISOString()
  } else {
    updatedAtIso = nowIso
  }

  return { version, source, updatedAt: updatedAtIso }
}

function mapSyncRosterError(error) {
  const message = error?.message || 'sync_failed'
  if (message.includes('room_owner_mismatch')) {
    return { status: 403, body: { error: 'forbidden' } }
  }
  if (message.includes('room_not_found')) {
    return { status: 404, body: { error: 'room_not_found' } }
  }
  if (message.includes('slot_version_conflict')) {
    return { status: 409, body: { error: 'slot_version_conflict' } }
  }
  if (message.includes('empty_roster')) {
    return { status: 400, body: { error: 'empty_roster' } }
  }
  return { status: 400, body: { error: message } }
}

function mapEnsureSessionError(error) {
  const message = error?.message || ''
  if (message.includes('room_owner_mismatch')) {
    return { status: 403, body: { error: 'forbidden' } }
  }
  if (message.includes('room_not_found')) {
    return { status: 404, body: { error: 'room_not_found' } }
  }
  if (isMissingRpcError(error, 'ensure_rank_session_for_room')) {
    return {
      status: 500,
      body: {
        error: 'missing_ensure_rank_session_for_room',
        hint:
          'Supabase에 ensure_rank_session_for_room(uuid, uuid, uuid, text, jsonb) 함수를 배포하고 권한을 부여하세요.',
        supabaseError: error,
      },
    }
  }
  return {
    status: 400,
    body: {
      error: error?.message || 'session_sync_failed',
      supabaseError: error,
    },
  }
}

async function ensureRoomReady(roomId, allowPartial) {
  if (allowPartial) {
    return null
  }

  const { error } = await supabaseAdmin.rpc('assert_room_ready', { p_room_id: roomId })
  if (!error) {
    return null
  }

  if (isMissingRpcError(error, 'assert_room_ready')) {
    return {
      status: 500,
      body: {
        error: 'missing_assert_room_ready',
        hint:
          'Supabase에 assert_room_ready(uuid) 함수를 배포하고 authenticated/service_role에 실행 권한을 부여하세요.',
        supabaseError: error,
      },
    }
  }

  return {
    status: 400,
    body: {
      error: error.message || 'ready_check_failed',
      supabaseError: error,
    },
  }
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
  const allowPartial = payload.allow_partial === true || payload.allow_partial === 'true'
  const asyncFillMeta =
    payload.async_fill_meta && typeof payload.async_fill_meta === 'object'
      ? payload.async_fill_meta
      : null
  const readyVotePayload =
    payload.ready_vote && typeof payload.ready_vote === 'object'
      ? payload.ready_vote
      : null
  const bodyMatchMode = toOptionalTrimmedString(payload.match_mode || payload.mode || null)

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

  const roomContext = await fetchRoomContext(roomId)
  if (roomContext.errorResponse) {
    return res
      .status(roomContext.errorResponse.status)
      .json(roomContext.errorResponse.body)
  }

  const roomOwnerId = roomContext.ownerId
  const ownershipError = ensureRoomOwnership(roomOwnerId, user.id)
  if (ownershipError) {
    return res.status(ownershipError.status).json(ownershipError.body)
  }

  const roomMode = bodyMatchMode || roomContext.mode

  const ownerIds = Array.from(new Set(rosterEntries.map((entry) => entry.ownerId).filter(Boolean)))
  const heroIds = Array.from(new Set(rosterEntries.map((entry) => entry.heroId).filter(Boolean)))

  const participantResult = await fetchParticipantStats(gameId, ownerIds)
  if (participantResult.errorResponse) {
    return res
      .status(participantResult.errorResponse.status)
      .json(participantResult.errorResponse.body)
  }

  const heroResult = await fetchHeroSummaries(heroIds)
  if (heroResult.errorResponse) {
    return res
      .status(heroResult.errorResponse.status)
      .json(heroResult.errorResponse.body)
  }

  const nowIso = new Date().toISOString()
  const insertRows = buildRosterInsertRows({
    rosterEntries,
    participantMap: participantResult.map,
    heroSummaryMap: heroResult.map,
    heroPayloadMap: heroMap,
    nowIso,
    matchInstanceId,
    roomId,
    gameId,
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

  const { version: slotTemplateVersion, source: slotTemplateSource, updatedAt: slotTemplateUpdatedAt } =
    normalizeSlotTemplateMetadata(slotTemplatePayload, nowIso)

  const readinessError = await ensureRoomReady(roomId, allowPartial)
  if (readinessError) {
    return res.status(readinessError.status).json(readinessError.body)
  }

  const rpcPayload = {
    p_room_id: roomId,
    p_game_id: gameId,
    p_match_instance_id: matchInstanceId,
    p_request_owner_id: roomOwnerId,
    p_slot_template_version: slotTemplateVersion,
    p_slot_template_source: slotTemplateSource,
    p_slot_template_updated_at: slotTemplateUpdatedAt,
    p_roster: insertRows,
  }

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('sync_rank_match_roster', rpcPayload)

  if (rpcError) {
    const mapped = mapSyncRosterError(rpcError)
    return res.status(mapped.status).json(mapped.body)
  }

  const summary = Array.isArray(rpcData) && rpcData.length ? rpcData[0] : null

  const ensurePayload = {
    p_room_id: roomId,
    p_game_id: gameId,
    p_owner_id: roomOwnerId,
    p_mode: roomMode,
    p_vote: readyVotePayload,
  }

  const { data: ensureData, error: ensureError } = await supabaseAdmin.rpc(
    'ensure_rank_session_for_room',
    ensurePayload,
  )

  if (ensureError) {
    const mapped = mapEnsureSessionError(ensureError)
    return res.status(mapped.status).json(mapped.body)
  }

  let sessionId = null
  if (Array.isArray(ensureData) && ensureData.length) {
    sessionId = toOptionalTrimmedString(ensureData[0])
  } else if (typeof ensureData === 'string') {
    sessionId = toOptionalTrimmedString(ensureData)
  } else if (ensureData && typeof ensureData === 'object' && ensureData.session_id) {
    sessionId = toOptionalTrimmedString(ensureData.session_id)
  }

  if (!sessionId) {
    return res.status(500).json({
      error: 'session_id_unavailable',
      hint:
        'ensure_rank_session_for_room가 세션 ID를 반환하도록 Supabase 함수를 점검하세요. 반환값이 uuid가 되도록 SQL을 확인해야 합니다.',
    })
  }

  if (sessionId && asyncFillMeta) {
    const { error: asyncFillError } = await supabaseAdmin.rpc('upsert_rank_session_async_fill', {
      p_session_id: sessionId,
      p_async_fill: asyncFillMeta,
    })

    if (asyncFillError && !isMissingRpcError(asyncFillError, 'upsert_rank_session_async_fill')) {
      addSupabaseDebugEvent({
        source: 'stage-room-match',
        operation: 'upsert_rank_session_async_fill',
        error: asyncFillError,
        payload: {
          sessionId,
        },
      })
    }
  }

  return res.status(200).json({
    ok: true,
    staged: summary?.inserted_count ?? insertRows.length,
    slot_template_version: summary?.slot_template_version ?? slotTemplateVersion,
    slot_template_updated_at: summary?.slot_template_updated_at ?? slotTemplateUpdatedAt,
    session_id: sessionId,
    ready_vote: readyVotePayload,
  })
}
