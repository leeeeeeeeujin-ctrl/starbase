import { withTable } from '@/lib/supabaseTables'

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
  return {
    id,
    status: toTrimmed(row.status),
    owner_id: ownerId,
    ownerId,
    created_at: row.created_at ?? row.createdAt ?? null,
    updated_at: row.updated_at ?? row.updatedAt ?? null,
    mode: toTrimmed(row.mode),
  }
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

  const rpcPayload = ownerId
    ? { p_game_id: trimmedGameId, p_owner_id: ownerId }
    : { p_game_id: trimmedGameId }

  if (typeof supabaseClient?.rpc === 'function') {
    const rpcCandidates = ['fetch_latest_rank_session_v2', 'fetch_latest_rank_session']

    for (const rpcName of rpcCandidates) {
      try {
        const { data: rpcData, error: rpcError } = await supabaseClient.rpc(rpcName, rpcPayload)

        if (!rpcError && rpcData) {
          const payload = Array.isArray(rpcData) ? rpcData[0] : rpcData
          const formatted = formatSessionRow(payload)
          if (formatted) {
            return formatted
          }
        }

        if (!rpcError) {
          continue
        }

        if (rpcError?.code === 'PGRST203') {
          console.warn(
            `[matchRealtimeSync] ${rpcName} RPC ambiguous (PGRST203); attempting next candidate`,
            rpcError,
          )
          continue
        }

        if (!isRpcMissing(rpcError)) {
          console.warn(`[matchRealtimeSync] ${rpcName} RPC failed:`, rpcError)
        }
      } catch (rpcException) {
        console.warn(`[matchRealtimeSync] ${rpcName} RPC threw:`, rpcException)
      }
    }
  }

  console.warn(
    '[matchRealtimeSync] fetch_latest_rank_session RPCs unavailable; returning null to avoid legacy rank_sessions query',
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

export async function loadMatchFlowSnapshot(supabaseClient, gameId) {
  const trimmedGameId = toTrimmed(gameId)
  if (!trimmedGameId) {
    return null
  }

  const {
    data: rosterData,
    error: rosterError,
  } = await withTable(supabaseClient, 'rank_match_roster', (table) =>
    supabaseClient
      .from(table)
      .select(
        'id, match_instance_id, room_id, slot_index, slot_id, role, owner_id, hero_id, hero_name, hero_summary, ready, joined_at, slot_template_version, slot_template_source, slot_template_updated_at, updated_at',
      )
      .eq('game_id', trimmedGameId)
      .order('slot_template_version', { ascending: false })
      .order('slot_index', { ascending: true }),
  )

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

  let bestVersion = -Infinity
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
        parseTimestamp(row?.slot_template_updated_at) ?? parseTimestamp(row?.updated_at) ?? parseTimestamp(row?.created_at)
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
  const slotTemplateSource = targetRows[0]?.slot_template_source || 'room-stage'
  const slotTemplateUpdatedAt =
    targetUpdatedAt !== -Infinity && targetUpdatedAt !== null ? targetUpdatedAt : Date.now()
  const matchInstanceId = toOptionalTrimmed(targetRows[0]?.match_instance_id)

  let roomRow = null
  if (targetRoomId) {
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

  const formattedRoom = formatRoom(roomRow)

  const sessionRow = await fetchLatestSessionRow(supabaseClient, trimmedGameId)

  let sessionMeta = null
  if (sessionRow?.id) {
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
