import { addDebugEvent, addSupabaseDebugEvent } from '@/lib/debugCollector'
import { withTable } from '@/lib/supabaseTables'

function isBrowserEnvironment() {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined'
}

function safeJsonParse(payload) {
  if (!payload) return null
  try {
    return JSON.parse(payload)
  } catch (error) {
    return null
  }
}

function toTrimmed(value) {
  if (value === null || value === undefined) return ''
  const trimmed = String(value).trim()
  return trimmed
}

function toOptionalTrimmed(value) {
  const trimmed = toTrimmed(value)
  return trimmed ? trimmed : null
}

function toBoolean(value) {
  if (value === true || value === false) return value
  if (value === null || value === undefined) return false
  if (typeof value === 'string') {
    const token = value.trim().toLowerCase()
    if (!token) return false
    return ['true', '1', 'y', 'yes', 'on'].includes(token)
  }
  return Boolean(value)
}

function toNumber(value, fallback = null) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return numeric
}

function parseTimestamp(value) {
  if (!value && value !== 0) return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return Math.trunc(value)
  }
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const direct = Number(trimmed)
    if (Number.isFinite(direct)) return Math.trunc(direct)
    const parsed = Date.parse(trimmed)
    if (Number.isNaN(parsed)) return null
    return Math.trunc(parsed)
  }
  const coerced = Number(value)
  return Number.isFinite(coerced) ? Math.trunc(coerced) : null
}

function normalizeRosterRow(row, fallbackIndex = 0) {
  const slotIndex = toNumber(row?.slot_index, fallbackIndex)
  const ownerId = toOptionalTrimmed(row?.owner_id)
  const heroId = toOptionalTrimmed(row?.hero_id)
  const heroSummary = row?.hero_summary && typeof row.hero_summary === 'object' ? row.hero_summary : null
  const heroName =
    toTrimmed(row?.hero_name) ||
    (heroSummary && typeof heroSummary.name === 'string' ? heroSummary.name : '')

  return {
    slotId: toOptionalTrimmed(row?.slot_id),
    slotIndex: slotIndex != null ? slotIndex : fallbackIndex,
    role: toTrimmed(row?.role) || '역할 미지정',
    ownerId: ownerId || '',
    heroId: heroId || '',
    heroName,
    ready: row?.ready === true,
    joinedAt: row?.joined_at || null,
    heroSummary,
  }
}

function buildHeroMap(rows = []) {
  const map = {}
  rows.forEach((row) => {
    const heroId = toOptionalTrimmed(row?.hero_id)
    if (!heroId) return
    const summary = row?.hero_summary && typeof row.hero_summary === 'object' ? row.hero_summary : null
    if (summary) {
      map[heroId] = summary
    } else {
      const heroName = toTrimmed(row?.hero_name)
      if (heroName) {
        map[heroId] = { name: heroName }
      }
    }
  })
  return map
}

function buildRoleGroups(roster = []) {
  const groups = new Map()
  roster.forEach((entry) => {
    if (!entry) return
    const roleKey = entry.role || '역할 미지정'
    if (!groups.has(roleKey)) {
      groups.set(roleKey, {
        role: roleKey,
        members: [],
      })
    }
    const bucket = groups.get(roleKey)
    bucket.members.push({
      ownerId: entry.ownerId,
      heroId: entry.heroId,
      heroName: entry.heroName,
      ready: entry.ready,
      slotIndex: entry.slotIndex,
      joinedAt: entry.joinedAt,
    })
  })
  return groups
}

function buildAssignmentsFromGroups(groups) {
  return Array.from(groups.values()).map((group) => ({
    role: group.role,
    members: group.members.map((member) => ({ ...member })),
  }))
}

function buildRolesFromGroups(groups) {
  return Array.from(groups.values()).map((group) => ({
    role: group.role,
    slots: group.members.length,
    members: group.members.map((member) => ({ ...member })),
  }))
}

function buildSlotLayoutFromRoster(roster = []) {
  return roster.map((entry) => ({
    slotId: entry.slotId,
    slotIndex: entry.slotIndex,
    slot_index: entry.slotIndex,
    role: entry.role,
    ownerId: entry.ownerId,
    owner_id: entry.ownerId,
    heroId: entry.heroId,
    hero_id: entry.heroId,
    heroName: entry.heroName,
    ready: entry.ready,
    joinedAt: entry.joinedAt,
    occupant_owner_id: entry.ownerId || null,
    occupant_hero_id: entry.heroId || null,
    occupant_ready: entry.ready || false,
    occupant_joined_at: entry.joinedAt || null,
    active: true,
  }))
}

function formatRoom(row) {
  if (!row || typeof row !== 'object') return null
  const ownerId = toOptionalTrimmed(row.owner_id)
  return {
    id: toOptionalTrimmed(row.id),
    code: toTrimmed(row.code),
    status: toTrimmed(row.status),
    mode: toTrimmed(row.mode),
    realtimeMode: toTrimmed(row.realtime_mode),
    hostRoleLimit: row.host_role_limit != null ? Number(row.host_role_limit) : null,
    blindMode: toBoolean(row.blind_mode),
    scoreWindow: row.score_window != null ? Number(row.score_window) : null,
    updatedAt: row.updated_at || null,
    ownerId,
    owner_id: ownerId,
  }
}

function formatSessionRow(row) {
  if (!row || typeof row !== 'object') return null
  const id = toOptionalTrimmed(row.id)
  if (!id) return null
  const ownerId = toOptionalTrimmed(row.owner_id ?? row.ownerId)
  const matchMode = toTrimmed(row.match_mode ?? row.matchMode ?? row.mode)
  return {
    id,
    status: toTrimmed(row.status),
    owner_id: ownerId,
    ownerId,
    created_at: row.created_at ?? row.createdAt ?? null,
    updated_at: row.updated_at ?? row.updatedAt ?? null,
    mode: matchMode,
    match_mode: matchMode,
  }
}

async function fetchSessionViaApi(gameId, ownerId) {
  if (!isBrowserEnvironment() || typeof fetch !== 'function') return null
  const body = { game_id: gameId }
  if (ownerId) {
    body.owner_id = ownerId
  }

  try {
    const response = await fetch('/api/rank/latest-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const text = await response.text()
    const data = safeJsonParse(text) || {}

    if (!response.ok) {
      const failure = {
        status: response.status,
        error: data?.error,
        message: data?.message,
        details: data?.details,
        hint: data?.hint,
        supabaseError: data?.supabaseError,
      }

      console.warn('[matchRealtimeSync] latest-session API failed:', failure)

      addSupabaseDebugEvent({
        source: 'latest-session-api',
        operation: 'fetch_latest_rank_session_v2',
        status: response.status,
        error: data?.supabaseError || data,
        payload: { request: body, response: failure },
      })
      return null
    }

    if (data?.session) {
      return formatSessionRow(data.session)
    }
  } catch (error) {
    console.warn('[matchRealtimeSync] latest-session API threw:', error)
    addDebugEvent({
      level: 'error',
      source: 'latest-session-api',
      message: 'Latest session API request threw an exception',
      details: { message: error?.message || 'unknown_error' },
    })
  }

  return null
}

function isRpcMissing(error) {
  if (!error) return false
  const code = String(error.code || '').toUpperCase()
  if (!code || code === 'NULL') {
    const merged = `${error.message || ''} ${error.details || ''}`.toLowerCase()
    return merged.includes('not exist') || merged.includes('missing')
  }
  return ['42883', '42P01', 'PGRST100', 'PGRST204', 'PGRST301'].includes(code)
}

export async function fetchLatestSessionRow(supabaseClient, gameId, options = {}) {
  const trimmedGameId = toTrimmed(gameId)
  if (!trimmedGameId) {
    return null
  }

  const ownerId = options.ownerId ? toTrimmed(options.ownerId) : null

  if (isBrowserEnvironment()) {
    const viaApi = await fetchSessionViaApi(trimmedGameId, ownerId)
    if (viaApi) {
      return viaApi
    }
    return null
  }

  const rpcPayload = ownerId
    ? { p_game_id: trimmedGameId, p_owner_id: ownerId }
    : { p_game_id: trimmedGameId }

  if (typeof supabaseClient?.rpc === 'function') {
    try {
      const { data: rpcData, error: rpcError } = await supabaseClient.rpc(
        'fetch_latest_rank_session_v2',
        rpcPayload,
      )

      if (!rpcError && rpcData) {
        const payload = Array.isArray(rpcData) ? rpcData[0] : rpcData
        const formatted = formatSessionRow(payload)
        if (formatted) {
          return formatted
        }
      }

      if (rpcError?.code === 'PGRST203') {
        console.warn(
          '[matchRealtimeSync] fetch_latest_rank_session_v2 RPC ambiguous (PGRST203); please drop legacy overloads',
          rpcError,
        )
      } else if (!isRpcMissing(rpcError)) {
        console.warn('[matchRealtimeSync] fetch_latest_rank_session_v2 RPC failed:', rpcError)
      }
    } catch (rpcException) {
      console.warn('[matchRealtimeSync] fetch_latest_rank_session_v2 RPC threw:', rpcException)
    }
  }

  console.warn(
    '[matchRealtimeSync] fetch_latest_rank_session_v2 RPC unavailable; returning null to avoid legacy rank_sessions query',
  )
  return null
}

function mapSessionMeta(row) {
  if (!row || typeof row !== 'object') return null
  const payload = {}
  const updatedAt = parseTimestamp(row.updated_at) || Date.now()

  if (row.selected_time_limit_seconds != null) {
    payload.turnTimer = {
      baseSeconds: Number(row.selected_time_limit_seconds) || 0,
      updatedAt,
      source: 'supabase',
    }
  }

  if (row.time_vote) {
    payload.vote = {
      turnTimer: row.time_vote,
    }
  }

  if (row.drop_in_bonus_seconds != null) {
    payload.dropIn = {
      bonusSeconds: Number(row.drop_in_bonus_seconds) || 0,
      updatedAt,
    }
  }

  if (row.async_fill_snapshot) {
    payload.asyncFill = row.async_fill_snapshot
  }

  if (row.turn_state) {
    payload.turnState = row.turn_state
  }

  if (row.extras) {
    payload.extras = row.extras
  }

  if (row.realtime_mode) {
    payload.realtimeMode = row.realtime_mode
  }

  if (Object.keys(payload).length === 0) {
    return null
  }

  return {
    ...payload,
    source: 'supabase',
    updatedAt,
  }
}

function isOrderedSetAggregateError(error) {
  if (!error) return false
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('ordered-set') && message.includes('within group')
}

function createOrderedSetAggregateException(error, context = {}) {
  const exception = new Error(
    'ordered-set 집계를 사용하는 Supabase 함수에 WITHIN GROUP 절이 빠져 있어 매치 준비 스냅샷을 불러오지 못했습니다.',
  )
  exception.code = 'ordered_set_aggregate'
  exception.supabaseError = error || null
  exception.hint = [
    'Supabase SQL에서 percentile, mode와 같은 ordered-set 집계를 호출할 때는 `WITHIN GROUP (ORDER BY ...)` 절이 필요합니다.',
    'fetch_rank_match_ready_snapshot 혹은 관련 RPC/뷰에서 누락된 WITHIN GROUP 절을 추가한 뒤 다시 시도하세요.',
  ].join(' ')
  exception.context = context
  return exception
}

function normaliseSnapshotEnvelope(envelope) {
  if (!envelope) return null
  const payload = Array.isArray(envelope) ? envelope[0] : envelope
  if (!payload || typeof payload !== 'object') return null
  return payload
}

export async function loadMatchFlowSnapshot(supabaseClient, gameId) {
  const trimmedGameId = toTrimmed(gameId)
  if (!trimmedGameId) {
    return null
  }

  let rosterData = null
  let rosterError = null
  let rosterEnvelope = null
  let slotTemplateVersionOverride = null
  let slotTemplateUpdatedAtOverride = null
  let slotTemplateSourceOverride = null
  let roomEnvelope = null
  let sessionEnvelope = null
  let sessionMetaEnvelope = null

  if (typeof supabaseClient?.rpc === 'function') {
    try {
      const { data: rpcData, error: rpcError } = await supabaseClient.rpc(
        'fetch_rank_match_ready_snapshot',
        { p_game_id: trimmedGameId },
      )

      if (rpcError) {
        if (isOrderedSetAggregateError(rpcError)) {
          addSupabaseDebugEvent({
            source: 'match-ready-snapshot',
            operation: 'fetch_rank_match_ready_snapshot',
            error: rpcError,
            level: 'error',
          })
          throw createOrderedSetAggregateException(rpcError, {
            operation: 'fetch_rank_match_ready_snapshot',
          })
        }

        addSupabaseDebugEvent({
          source: 'match-ready-snapshot',
          operation: 'fetch_rank_match_ready_snapshot',
          error: rpcError,
        })
      }

      const envelope = normaliseSnapshotEnvelope(rpcData)
      if (envelope) {
        rosterEnvelope = envelope
        rosterData = Array.isArray(envelope.roster) ? envelope.roster : []
        slotTemplateVersionOverride = envelope.slot_template_version ?? null
        slotTemplateUpdatedAtOverride = envelope.slot_template_updated_at ?? null
        slotTemplateSourceOverride = envelope.slot_template_source ?? null
        roomEnvelope = envelope.room || null
        sessionEnvelope = envelope.session || null
        sessionMetaEnvelope = envelope.session_meta || null
      }
    } catch (rpcException) {
      if (isOrderedSetAggregateError(rpcException)) {
        throw createOrderedSetAggregateException(rpcException, {
          operation: 'fetch_rank_match_ready_snapshot',
        })
      }
      addSupabaseDebugEvent({
        source: 'match-ready-snapshot',
        operation: 'fetch_rank_match_ready_snapshot',
        error: rpcException,
        level: 'error',
        message: 'Snapshot RPC threw an exception',
      })
    }
  }

  if (!rosterData) {
    const result = await withTable(supabaseClient, 'rank_match_roster', (table) =>
      supabaseClient
        .from(table)
        .select(
          'id, match_instance_id, room_id, slot_index, slot_id, role, owner_id, hero_id, hero_name, hero_summary, ready, joined_at, slot_template_version, slot_template_source, slot_template_updated_at, updated_at, created_at, game_id, score, rating, battles, win_rate, status, standin, match_source',
        )
        .eq('game_id', trimmedGameId)
        .order('slot_template_version', { ascending: false })
        .order('slot_index', { ascending: true }),
    )

    rosterData = result.data
    rosterError = result.error
  }

  if (rosterError) {
    throw rosterError
  }

  if (!Array.isArray(rosterData) || rosterData.length === 0) {
    return {
      roster: [],
      participantPool: [],
      heroOptions: [],
      heroMap: {},
      slotTemplate: null,
      matchSnapshot: null,
      sessionMeta: null,
      hostOwnerId: null,
      hostRoleLimit: null,
      realtimeMode: null,
      matchMode: '',
      slotTemplateVersion: null,
      slotTemplateUpdatedAt: null,
      matchInstanceId: null,
      roomId: null,
      sessionId: null,
    }
  }

  let bestVersion =
    slotTemplateVersionOverride != null ? Number(slotTemplateVersionOverride) || 0 : -Infinity
  rosterData.forEach((row) => {
    const version = Number(row?.slot_template_version) || 0
    if (version > bestVersion) {
      bestVersion = version
    }
  })

  const rowsByRoom = new Map()
  rosterData.forEach((row) => {
    const version = Number(row?.slot_template_version) || 0
    if (version !== bestVersion) return
    const roomId = toOptionalTrimmed(row?.room_id) || '__unknown__'
    if (!rowsByRoom.has(roomId)) {
      rowsByRoom.set(roomId, [])
    }
    rowsByRoom.get(roomId).push(row)
  })

  let targetRoomId = null
  let targetRows = null
  let targetUpdatedAt = -Infinity

  rowsByRoom.forEach((rows, roomId) => {
    if (!Array.isArray(rows) || rows.length === 0) return
    const latest = rows.reduce((acc, row) => {
      const timestamp =
        parseTimestamp(row?.slot_template_updated_at) ?? parseTimestamp(row?.updated_at) ?? parseTimestamp(row?.created_at)
      return Math.max(acc, timestamp != null ? timestamp : -Infinity)
    }, -Infinity)
    if (!targetRows || latest > targetUpdatedAt) {
      targetRows = rows
      targetRoomId = roomId === '__unknown__' ? null : roomId
      targetUpdatedAt = latest
    }
  })

  if (!targetRows) {
    targetRows = rosterData.filter((row) => Number(row?.slot_template_version) === bestVersion)
    targetRoomId = toOptionalTrimmed(targetRows[0]?.room_id) || null
    targetUpdatedAt = targetRows.reduce((acc, row) => {
      const timestamp =
        parseTimestamp(row?.slot_template_updated_at) ??
        parseTimestamp(row?.updated_at) ??
        parseTimestamp(row?.created_at)
      return Math.max(acc, timestamp != null ? timestamp : -Infinity)
    }, -Infinity)
  }

  const normalizedRoster = targetRows.map((row, index) => normalizeRosterRow(row, index))
  const heroMap = buildHeroMap(targetRows)
  const heroOptions = Array.from(new Set(normalizedRoster.map((entry) => entry.heroId).filter(Boolean)))
  const participantPool = normalizedRoster.map((entry) => ({
    slotIndex: entry.slotIndex,
    role: entry.role,
    ownerId: entry.ownerId,
    heroId: entry.heroId,
    heroName: entry.heroName,
    ready: entry.ready,
    joinedAt: entry.joinedAt,
  }))
  const groups = buildRoleGroups(normalizedRoster)
  const assignments = buildAssignmentsFromGroups(groups)
  const roles = buildRolesFromGroups(groups)
  const slotLayout = buildSlotLayoutFromRoster(normalizedRoster)

  const slotTemplateVersion = bestVersion
  const slotTemplateSource = slotTemplateSourceOverride || targetRows[0]?.slot_template_source || 'room-stage'
  const slotTemplateUpdatedAt =
    slotTemplateUpdatedAtOverride != null
      ? parseTimestamp(slotTemplateUpdatedAtOverride) || Date.now()
      : targetUpdatedAt !== -Infinity && targetUpdatedAt !== null
        ? targetUpdatedAt
        : Date.now()
  const matchInstanceId = toOptionalTrimmed(targetRows[0]?.match_instance_id)

  let roomRow = roomEnvelope || null
  if (!roomRow && targetRoomId) {
    const { data: directRoom, error: directError } = await withTable(
      supabaseClient,
      'rank_rooms',
      (table) =>
        supabaseClient
          .from(table)
          .select(
            'id, owner_id, code, status, mode, realtime_mode, host_role_limit, blind_mode, score_window, updated_at, game_id',
          )
          .eq('id', targetRoomId)
          .maybeSingle(),
    )
    if (!directError && directRoom) {
      roomRow = directRoom
    }
  }

  if (!roomRow) {
    if (roomEnvelope) {
      roomRow = roomEnvelope
      targetRoomId = toOptionalTrimmed(roomEnvelope?.id) || targetRoomId
    } else {
      const { data: fallbackRooms, error: fallbackError } = await withTable(
        supabaseClient,
        'rank_rooms',
        (table) =>
          supabaseClient
            .from(table)
            .select(
              'id, owner_id, code, status, mode, realtime_mode, host_role_limit, blind_mode, score_window, updated_at, game_id',
            )
            .eq('game_id', trimmedGameId)
            .order('updated_at', { ascending: false })
            .limit(1),
      )
      if (!fallbackError && Array.isArray(fallbackRooms) && fallbackRooms.length) {
        roomRow = fallbackRooms[0]
        if (!targetRoomId) {
          targetRoomId = toOptionalTrimmed(roomRow?.id) || null
        }
      }
    }
  }

  const formattedRoom = formatRoom(roomRow)

  let sessionRow = null
  if (sessionEnvelope) {
    sessionRow = formatSessionRow(sessionEnvelope)
  }
  if (!sessionRow) {
    sessionRow = await fetchLatestSessionRow(supabaseClient, trimmedGameId)
  }

  let sessionMeta = null
  if (sessionMetaEnvelope) {
    sessionMeta = mapSessionMeta(sessionMetaEnvelope)
  }

  if (!sessionMeta && sessionRow?.id) {
    const { data: metaRow, error: metaError } = await withTable(
      supabaseClient,
      'rank_session_meta',
      (table) =>
        supabaseClient
          .from(table)
          .select(
            'session_id, selected_time_limit_seconds, time_vote, drop_in_bonus_seconds, turn_state, async_fill_snapshot, realtime_mode, extras, updated_at',
          )
          .eq('session_id', sessionRow.id)
          .maybeSingle(),
    )
    if (!metaError && metaRow) {
      sessionMeta = mapSessionMeta(metaRow)
    }
  }

  const matchRooms = formattedRoom ? [formattedRoom] : []

  const matchSnapshot = {
    match: {
      instanceId: matchInstanceId,
      matchInstanceId,
      match_instance_id: matchInstanceId,
      assignments,
      maxWindow: formattedRoom?.scoreWindow ?? null,
      heroMap,
      matchCode: formattedRoom?.code || '',
      matchType: formattedRoom?.mode || 'standard',
      blindMode: formattedRoom?.blindMode ?? false,
      brawlVacancies: [],
      roleStatus: {
        slotLayout,
        roles: roles.map((role) => ({
          role: role.role,
          slots: role.slots,
          members: role.members.map((member) => ({ ...member })),
        })),
        version: slotTemplateVersion,
        updatedAt: slotTemplateUpdatedAt,
        source: slotTemplateSource,
      },
      sampleMeta: null,
      dropInTarget: null,
      turnTimer: sessionMeta?.turnTimer ?? null,
      rooms: matchRooms,
      roles: roles.map((role) => ({
        role: role.role,
        slots: role.slots,
        members: role.members.map((member) => ({ ...member })),
      })),
      slotLayout,
      source: 'match-realtime',
    },
    mode: formattedRoom?.mode || sessionRow?.mode || '',
    viewerId: '',
    heroId: '',
    role: '',
    createdAt: slotTemplateUpdatedAt,
  }

  const slotTemplate = {
    slots: slotLayout,
    roles: roles.map((role) => ({
      role: role.role,
      slots: role.slots,
      members: role.members.map((member) => ({ ...member })),
    })),
    version: slotTemplateVersion,
    updatedAt: slotTemplateUpdatedAt,
    source: slotTemplateSource,
  }

  return {
    roster: normalizedRoster,
    participantPool,
    heroOptions,
    heroMap,
    slotTemplate,
    matchSnapshot,
    sessionMeta,
    hostOwnerId: formattedRoom?.ownerId || null,
    hostRoleLimit: formattedRoom?.hostRoleLimit ?? null,
    realtimeMode: formattedRoom?.realtimeMode || null,
    matchMode: matchSnapshot.mode || '',
    slotTemplateVersion,
    slotTemplateUpdatedAt,
    matchInstanceId,
    roomId: formattedRoom?.id || targetRoomId || null,
    sessionId: sessionRow?.id || null,
  }
}
