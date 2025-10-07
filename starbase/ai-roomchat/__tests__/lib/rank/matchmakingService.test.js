import {
  enqueueParticipant,
  filterStaleQueueEntries,
  heartbeatQueueEntry,
  loadActiveRoles,
  loadMatchSampleSource,
  loadOwnerParticipantRoster,
  loadRoleLayout,
  extractViewerAssignment,
  runMatching,
} from '@/lib/rank/matchmakingService'

function createSupabaseStub(tableData = {}) {
  return {
    __tables: tableData,
    from(table) {
      const rows = tableData[table] || []
      return createQueryBuilder(rows, table, tableData)
    },
  }
}

function createQueryBuilder(initialRows, tableName, tableData) {
  const filters = []
  let orderConfig = null
  let action = 'select'
  let insertPayload = null
  let updatePayload = null

  const builder = {
    select() {
      action = 'select'
      return builder
    },
    eq(column, value) {
      filters.push((row) => normalizeValue(row[column]) === normalizeValue(value))
      return builder
    },
    in(column, values = []) {
      const normalized = new Set(values.map(normalizeValue))
      filters.push((row) => normalized.has(normalizeValue(row[column])))
      return builder
    },
    order(column, options = {}) {
      orderConfig = { column, ascending: options.ascending !== false }
      return builder
    },
    maybeSingle() {
      try {
        const data = runQuery()
        const first = Array.isArray(data) ? data[0] ?? null : data
        return Promise.resolve({ data: first, error: null })
      } catch (error) {
        return Promise.resolve({ data: null, error })
      }
    },
    delete() {
      action = 'delete'
      return builder
    },
    insert(payload) {
      action = 'insert'
      insertPayload = Array.isArray(payload) ? payload : [payload]
      return builder
    },
    update(payload) {
      action = 'update'
      updatePayload = payload || {}
      return builder
    },
    then(resolve, reject) {
      try {
        const payload = performAction()
        return Promise.resolve(payload).then(resolve, reject)
      } catch (error) {
        const payload = { data: null, error }
        return Promise.resolve(payload).then(resolve, reject)
      }
    },
  }

  function getRows() {
    return Array.isArray(tableData[tableName]) ? [...tableData[tableName]] : [...initialRows]
  }

  function performAction() {
    if (action === 'delete') {
      const data = runQuery()
      const remaining = getRows().filter((row) => !data.includes(row))
      tableData[tableName] = remaining
      action = 'select'
      return { data, error: null }
    }

    if (action === 'insert') {
      const current = getRows()
      tableData[tableName] = [...current, ...insertPayload]
      const data = insertPayload
      action = 'select'
      insertPayload = null
      return { data, error: null }
    }

    if (action === 'update') {
      const rows = getRows()
      const matched = []
      const updated = rows.map((row) => {
        if (filters.every((filter) => filter(row))) {
          const nextRow = { ...row, ...updatePayload }
          matched.push(nextRow)
          return nextRow
        }
        return row
      })
      tableData[tableName] = updated
      action = 'select'
      updatePayload = null
      return { data: matched, error: null }
    }

    const data = runQuery()
    return { data, error: null }
  }

  function runQuery() {
    let data = getRows()
    for (const filter of filters) {
      data = data.filter(filter)
    }
    if (orderConfig) {
      const { column, ascending } = orderConfig
      data.sort((a, b) => {
        const left = a?.[column] ?? 0
        const right = b?.[column] ?? 0
        if (left === right) return 0
        return ascending ? (left < right ? -1 : 1) : left < right ? 1 : -1
      })
    }
    return data
  }

  return builder
}

function normalizeValue(value) {
  if (value == null) return null
  if (typeof value === 'string') {
    return value.trim()
  }
  return value
}

describe('loadActiveRoles', () => {
  it('limits slot counts to active slots when a layout exists', async () => {
    const supabase = createSupabaseStub({
      rank_game_roles: [
        { game_id: 'game-roles', name: 'attack', slot_count: 3, active: true },
        { game_id: 'game-roles', name: 'support', slot_count: 2, active: true },
        { game_id: 'game-roles', name: 'tank', slot_count: 1, active: false },
      ],
      rank_game_slots: [
        { game_id: 'game-roles', slot_index: 0, role: 'attack', active: true },
        { game_id: 'game-roles', slot_index: 1, role: 'attack', active: true },
        { game_id: 'game-roles', slot_index: 2, role: 'attack', active: false },
        { game_id: 'game-roles', slot_index: 0, role: 'support', active: true },
        { game_id: 'game-roles', slot_index: 1, role: 'support', active: false },
      ],
    })

    const roles = await loadActiveRoles(supabase, 'game-roles')
    expect(roles).toEqual([
      { name: 'attack', slot_count: 2, slotCount: 2 },
      { name: 'support', slot_count: 1, slotCount: 1 },
    ])
  })

  it('falls back to declared counts when no slot layout exists', async () => {
    const supabase = createSupabaseStub({
      rank_game_roles: [
        { game_id: 'game-empty', name: 'attack', slot_count: 2, active: true },
      ],
      rank_game_slots: [],
    })

    const roles = await loadActiveRoles(supabase, 'game-empty')
    expect(roles).toEqual([{ name: 'attack', slot_count: 2, slotCount: 2 }])
  })

  it('derives slot counts from the rank_games.roles array when provided', async () => {
    const supabase = createSupabaseStub({
      rank_games: [
        {
          id: 'game-inline',
          roles: ['공격', '공격', null, '', '수비', '공격', '지원'],
        },
      ],
      rank_game_roles: [
        { game_id: 'game-inline', name: '공격', slot_count: 1, active: true },
        { game_id: 'game-inline', name: '수비', slot_count: 1, active: true },
      ],
    })

    const roles = await loadActiveRoles(supabase, 'game-inline')
    expect(roles).toEqual([
      { name: '공격', slot_count: 3, slotCount: 3 },
      { name: '수비', slot_count: 1, slotCount: 1 },
      { name: '지원', slot_count: 1, slotCount: 1 },
    ])
  })
})

describe('loadRoleLayout', () => {
  it('returns slot layout derived from inline roles array', async () => {
    const supabase = createSupabaseStub({
      rank_games: [
        {
          id: 'game-layout-inline',
          roles: ['A', null, 'B', 'A'],
        },
      ],
    })

    const { slotLayout, roles } = await loadRoleLayout(supabase, 'game-layout-inline')
    expect(roles).toEqual([
      { name: 'A', slot_count: 2, slotCount: 2 },
      { name: 'B', slot_count: 1, slotCount: 1 },
    ])
    expect(slotLayout).toEqual([
      { slotIndex: 0, role: 'A', heroId: null, heroOwnerId: null },
      { slotIndex: 2, role: 'B', heroId: null, heroOwnerId: null },
      { slotIndex: 3, role: 'A', heroId: null, heroOwnerId: null },
    ])
  })
})

describe('loadMatchSampleSource', () => {
  it('falls back to participant pool when realtime queue is empty', async () => {
    const supabase = createSupabaseStub({
      rank_match_queue: [],
      rank_participants: [
        {
          id: 'p1',
          game_id: 'game-1',
          owner_id: 'creator',
          hero_id: 'hero-1',
          role: 'attack',
          score: 1200,
          status: 'alive',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
    })

    const result = await loadMatchSampleSource(supabase, {
      gameId: 'game-1',
      mode: 'rank_solo',
      realtimeEnabled: true,
    })

    expect(result.sampleType).toBe('realtime_queue_fallback_pool')
    expect(result.entries).toHaveLength(1)
    expect(result.participantPool).toHaveLength(1)
    expect(result.entries[0].owner_id).toBe('creator')
    expect(result.standinCount).toBe(0)
    expect(result.queueWaitSeconds).toBeNull()
  })

  it('falls back to queue entries when participant pool is empty', async () => {
    const supabase = createSupabaseStub({
      rank_match_queue: [
        {
          id: 'q1',
          game_id: 'game-2',
          mode: 'rank_solo',
          owner_id: 'player',
          hero_id: 'hero-2',
          role: 'defense',
          score: 900,
          joined_at: '2024-01-01T00:00:00Z',
          status: 'waiting',
        },
      ],
      rank_participants: [],
    })

    const result = await loadMatchSampleSource(supabase, {
      gameId: 'game-2',
      mode: 'rank_solo',
      realtimeEnabled: false,
    })

    expect(result.sampleType).toBe('participant_pool_fallback_queue')
    expect(result.entries).toHaveLength(1)
    expect(result.queue).toHaveLength(1)
    expect(result.entries[0].owner_id).toBe('player')
    expect(typeof result.queueWaitSeconds === 'number').toBe(true)
  })

  it('waits for realtime queue before injecting stand-ins when under threshold', async () => {
    const now = Date.now()
    const supabase = createSupabaseStub({
      rank_match_queue: [
        {
          id: 'q1',
          game_id: 'game-3',
          mode: 'rank_solo',
          owner_id: 'player-1',
          hero_id: 'hero-10',
          role: 'attack',
          score: 1000,
          joined_at: new Date(now - 5_000).toISOString(),
          status: 'waiting',
        },
      ],
      rank_participants: [
        {
          id: 'p2',
          game_id: 'game-3',
          owner_id: 'standin-1',
          hero_id: 'hero-99',
          role: 'attack',
          score: 950,
          status: 'alive',
          updated_at: new Date(now - 60_000).toISOString(),
        },
      ],
    })

    const result = await loadMatchSampleSource(supabase, {
      gameId: 'game-3',
      mode: 'rank_solo',
      realtimeEnabled: true,
    })

    expect(result.sampleType).toBe('realtime_queue_waiting')
    expect(result.entries).toHaveLength(1)
    expect(result.standinCount).toBe(0)
    expect(result.queueWaitSeconds).toBeGreaterThanOrEqual(0)
    expect(result.queueWaitSeconds).toBeLessThan(30)
  })

  it('keeps realtime queues limited to actual entrants after the wait threshold', async () => {
    const now = Date.now()
    const supabase = createSupabaseStub({
      rank_match_queue: [
        {
          id: 'q2',
          game_id: 'game-4',
          mode: 'rank_solo',
          owner_id: 'player-2',
          hero_id: 'hero-22',
          role: 'defense',
          score: 1100,
          joined_at: new Date(now - 120_000).toISOString(),
          status: 'waiting',
        },
      ],
      rank_participants: [
        {
          id: 'p3',
          game_id: 'game-4',
          owner_id: 'standin-2',
          hero_id: 'hero-42',
          role: 'defense',
          score: 1080,
          status: 'alive',
          updated_at: new Date(now - 300_000).toISOString(),
        },
      ],
    })

    const result = await loadMatchSampleSource(supabase, {
      gameId: 'game-4',
      mode: 'rank_solo',
      realtimeEnabled: true,
    })

    expect(result.sampleType).toBe('realtime_queue')
    expect(result.entries).toHaveLength(1)
    expect(result.standinCount).toBe(0)
    expect(result.queueWaitSeconds).toBeGreaterThanOrEqual(30)
    const standin = result.entries.find((entry) => entry.standin)
    expect(standin).toBeUndefined()
  })
})

describe('enqueueParticipant', () => {
  it('prefers the participant record hero when queuing', async () => {
    const tables = {
      rank_participants: [
        {
          game_id: 'game-hero',
          owner_id: 'player-1',
          hero_id: 'hero-correct',
          hero_ids: ['hero-correct', 'hero-alt'],
          role: 'attack',
          score: 1234,
        },
      ],
      rank_match_queue: [],
    }
    const supabase = createSupabaseStub(tables)

    const response = await enqueueParticipant(supabase, {
      gameId: 'game-hero',
      mode: 'rank_solo',
      ownerId: 'player-1',
      heroId: 'hero-wrong',
      role: 'attack',
      score: 1200,
    })

    expect(response.ok).toBe(true)
    expect(response.heroId).toBe('hero-correct')
    expect(supabase.__tables.rank_match_queue).toHaveLength(1)
    expect(supabase.__tables.rank_match_queue[0].hero_id).toBe('hero-correct')
  })

  it('falls back to explicit hero when participant entry is missing', async () => {
    const tables = {
      rank_participants: [],
      rank_match_queue: [],
    }
    const supabase = createSupabaseStub(tables)

    const response = await enqueueParticipant(supabase, {
      gameId: 'game-hero',
      mode: 'rank_solo',
      ownerId: 'player-2',
      heroId: 'hero-explicit',
      role: 'support',
      score: 1100,
    })

    expect(response.ok).toBe(true)
    expect(response.heroId).toBe('hero-explicit')
    expect(supabase.__tables.rank_match_queue).toHaveLength(1)
    expect(supabase.__tables.rank_match_queue[0].hero_id).toBe('hero-explicit')
  })

  it('selects the hero that matches the requested role when multiple entries exist', async () => {
    const tables = {
      rank_participants: [
        {
          game_id: 'game-hero',
          owner_id: 'player-3',
          hero_id: 'hero-attack',
          role: 'attack',
          score: 1400,
        },
        {
          game_id: 'game-hero',
          owner_id: 'player-3',
          hero_id: 'hero-support',
          role: 'support',
          score: 1300,
        },
      ],
      rank_match_queue: [],
    }
    const supabase = createSupabaseStub(tables)

    const response = await enqueueParticipant(supabase, {
      gameId: 'game-hero',
      mode: 'rank_solo',
      ownerId: 'player-3',
      heroId: 'hero-manual',
      role: 'support',
      score: 1250,
    })

    expect(response.ok).toBe(true)
    expect(response.heroId).toBe('hero-support')
    expect(supabase.__tables.rank_match_queue[0].hero_id).toBe('hero-support')
  })

  it('prevents queuing when already waiting in another queue', async () => {
    const tables = {
      rank_participants: [],
      rank_match_queue: [
        {
          id: 'queue-existing',
          game_id: 'other-game',
          mode: 'rank_solo',
          owner_id: 'player-duplicate',
          hero_id: 'hero-existing',
          role: 'attack',
          status: 'waiting',
          joined_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
    }

    const supabase = createSupabaseStub(tables)

    const response = await enqueueParticipant(supabase, {
      gameId: 'game-hero',
      mode: 'rank_solo',
      ownerId: 'player-duplicate',
      heroId: 'hero-new',
      role: 'support',
      score: 1500,
    })

    expect(response.ok).toBe(false)
    expect(response.error).toMatch('이미 다른 대기열에 참여 중입니다')
    expect(supabase.__tables.rank_match_queue).toHaveLength(1)
  })

  it('prevents queuing when already matched in the same queue', async () => {
    const tables = {
      rank_participants: [],
      rank_match_queue: [
        {
          id: 'queue-matched',
          game_id: 'game-hero',
          mode: 'rank_solo',
          owner_id: 'player-duplicate',
          hero_id: 'hero-existing',
          role: 'attack',
          status: 'matched',
          joined_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:05:00Z',
        },
      ],
    }

    const supabase = createSupabaseStub(tables)

    const response = await enqueueParticipant(supabase, {
      gameId: 'game-hero',
      mode: 'rank_solo',
      ownerId: 'player-duplicate',
      heroId: 'hero-new',
      role: 'support',
      score: 1500,
    })

    expect(response.ok).toBe(false)
    expect(response.error).toMatch('이미 다른 대기열에 참여 중입니다')
    expect(supabase.__tables.rank_match_queue).toHaveLength(1)
  })

  it('replaces an existing waiting entry in the same queue', async () => {
    const tables = {
      rank_participants: [],
      rank_match_queue: [
        {
          id: 'queue-waiting',
          game_id: 'game-hero',
          mode: 'rank_solo',
          owner_id: 'player-duplicate',
          hero_id: 'hero-old',
          role: 'attack',
          status: 'waiting',
          joined_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
    }

    const supabase = createSupabaseStub(tables)

    const response = await enqueueParticipant(supabase, {
      gameId: 'game-hero',
      mode: 'rank_solo',
      ownerId: 'player-duplicate',
      heroId: 'hero-new',
      role: 'attack',
      score: 1600,
    })

    expect(response.ok).toBe(true)
    expect(response.heroId).toBe('hero-new')
    expect(supabase.__tables.rank_match_queue).toHaveLength(1)
    expect(supabase.__tables.rank_match_queue[0].hero_id).toBe('hero-new')
  })
})

describe('loadOwnerParticipantRoster', () => {
  it('returns a roster map scoped to the provided owners', async () => {
    const tables = {
      rank_participants: [
        {
          game_id: 'game-roster',
          owner_id: 'owner-1',
          hero_id: 'hero-a',
          role: 'attack',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          game_id: 'game-roster',
          owner_id: 'owner-2',
          hero_id: 'hero-b',
          role: 'support',
        },
      ],
    }
    const supabase = createSupabaseStub(tables)

    const roster = await loadOwnerParticipantRoster(supabase, {
      gameId: 'game-roster',
      ownerIds: ['owner-1'],
    })

    expect(roster.get('owner-1')).toHaveLength(1)
    expect(roster.get('owner-1')?.[0]?.heroId).toBe('hero-a')
    expect(roster.get('owner-2')).toBeUndefined()
  })
})

describe('runMatching', () => {
  it('groups solos and duos into a single room within the score window', () => {
    const result = runMatching({
      mode: 'rank_solo',
      roles: [
        {
          name: 'attack',
          slot_count: 3,
        },
      ],
      queue: [
        {
          id: 'solo-1',
          role: 'attack',
          hero_id: 'hero-1',
          owner_id: 'owner-1',
          score: 1250,
          joined_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'duo-1',
          role: 'attack',
          hero_id: 'hero-2',
          owner_id: 'owner-2',
          party_key: 'party-a',
          score: 1240,
          joined_at: '2024-01-01T00:00:05Z',
        },
        {
          id: 'duo-2',
          role: 'attack',
          hero_id: 'hero-3',
          owner_id: 'owner-3',
          party_key: 'party-a',
          score: 1265,
          joined_at: '2024-01-01T00:00:06Z',
        },
      ],
    })

    expect(result.ready).toBe(true)
    expect(result.assignments).toHaveLength(1)
    expect(result.rooms).toHaveLength(1)

    const [assignment] = result.assignments
    expect(assignment.role).toBe('attack x3')
    expect(assignment.members).toHaveLength(3)
    expect(assignment.filledSlots).toBe(3)
    expect(assignment.groups).toHaveLength(2)
    expect(assignment.roleSlots).toHaveLength(3)
    expect(assignment.roleSlots.every((slot) => slot.role === 'attack')).toBe(true)
    expect(new Set(assignment.members.map((member) => member.owner_id || member.ownerId))).toEqual(
      new Set(['owner-1', 'owner-2', 'owner-3']),
    )
    expect(result.rooms[0].label).toBe('attack x3')
    expect(result.rooms[0].missingSlots).toBe(0)
  })

  it('returns a pending room when slots are missing', () => {
    const result = runMatching({
      mode: 'rank_solo',
      roles: [
        {
          name: 'support',
          slot_count: 2,
        },
      ],
      queue: [
        {
          id: 'support-1',
          role: 'support',
          hero_id: 'hero-s1',
          owner_id: 'supporter',
          score: 990,
          joined_at: '2024-01-01T00:00:00Z',
        },
      ],
    })

    expect(result.ready).toBe(false)
    expect(result.assignments).toHaveLength(1)
    const [assignment] = result.assignments
    expect(assignment.role).toBe('support x2')
    expect(assignment.ready).toBe(false)
    expect(assignment.missingSlots).toBe(1)
    expect(assignment.roleSlots).toHaveLength(2)
    expect(assignment.roleSlots[0].role).toBe('support')
    expect(result.rooms[0].filledSlots).toBe(1)
    expect(result.rooms[0].missingSlots).toBe(1)
  })

  it('keeps duplicate heroes in separate waiting rooms', () => {
    const result = runMatching({
      mode: 'rank_solo',
      roles: [
        {
          name: 'attack',
          slot_count: 2,
        },
      ],
      queue: [
        {
          id: 'a-1',
          role: 'attack',
          hero_id: 'hero-dup',
          owner_id: 'owner-1',
          score: 1180,
          joined_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'a-2',
          role: 'attack',
          hero_id: 'hero-dup',
          owner_id: 'owner-2',
          score: 1195,
          joined_at: '2024-01-01T00:00:05Z',
        },
      ],
    })

    expect(result.ready).toBe(false)
    expect(result.error).toBeNull()
    expect(result.assignments).toHaveLength(2)
    expect(result.assignments.every((assignment) => assignment.filledSlots === 1)).toBe(true)
  })

  it('ignores participant-pool stand-ins when assembling realtime rooms', () => {
    const result = runMatching({
      mode: 'rank_solo',
      roles: [
        {
          name: 'attack',
          slot_count: 2,
        },
      ],
      queue: [
        {
          id: 'q1',
          role: 'attack',
          hero_id: 'hero-alpha',
          owner_id: 'creator',
          score: 1200,
          joined_at: '2024-01-01T00:00:00Z',
        },
        {
          id: null,
          role: 'attack',
          hero_id: 'hero-beta',
          owner_id: 'creator',
          score: 1180,
          joined_at: '2024-01-01T00:00:05Z',
          simulated: true,
          standin: true,
          match_source: 'participant_pool',
        },
      ],
    })

    expect(result.ready).toBe(false)
    expect(result.assignments).toHaveLength(1)
    expect(result.assignments[0].members).toHaveLength(1)
    expect(result.assignments[0].missingSlots).toBe(1)
  })

  it('rejects parties that exceed the score window', () => {
    const result = runMatching({
      mode: 'rank_solo',
      roles: [
        {
          name: 'attack',
          slot_count: 2,
        },
      ],
      queue: [
        {
          id: 'anchor',
          role: 'attack',
          hero_id: 'hero-a',
          owner_id: 'owner-a',
          score: 1400,
          joined_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'out-of-window',
          role: 'attack',
          hero_id: 'hero-b',
          owner_id: 'owner-b',
          score: 1650,
          joined_at: '2024-01-01T00:00:05Z',
        },
      ],
    })

    expect(result.ready).toBe(false)
    expect(result.assignments).toHaveLength(2)
    expect(result.assignments.every((assignment) => assignment.filledSlots === 1)).toBe(true)
    expect(result.rooms.every((room) => room.missingSlots === 1)).toBe(true)
  })
})

describe('filterStaleQueueEntries', () => {
  it('separates fresh and stale entries based on updated timestamp', () => {
    const now = Date.now()
    const entries = [
      {
        id: 'fresh',
        owner_id: 'fresh-owner',
        updated_at: new Date(now - 5_000).toISOString(),
        joined_at: new Date(now - 10_000).toISOString(),
      },
      {
        id: 'stale',
        owner_id: 'stale-owner',
        updated_at: new Date(now - 60_000).toISOString(),
        joined_at: new Date(now - 120_000).toISOString(),
      },
    ]

    const { freshEntries, staleEntries } = filterStaleQueueEntries(entries, {
      staleThresholdMs: 30_000,
      nowMs: now,
    })

    expect(freshEntries.map((entry) => entry.id)).toEqual(['fresh'])
    expect(staleEntries.map((entry) => entry.id)).toEqual(['stale'])
  })
})

describe('heartbeatQueueEntry', () => {
  it('updates the queue entry timestamp when waiting', async () => {
    const supabase = createSupabaseStub({
      rank_match_queue: [
        {
          id: 'queue-1',
          game_id: 'game-heartbeat',
          mode: 'rank_solo',
          owner_id: 'owner-heartbeat',
          status: 'waiting',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
    })

    const result = await heartbeatQueueEntry(supabase, {
      gameId: 'game-heartbeat',
      mode: 'rank_solo',
      ownerId: 'owner-heartbeat',
    })

    expect(result.ok).toBe(true)
    const updated = supabase.__tables.rank_match_queue[0].updated_at
    expect(updated).not.toBe('2024-01-01T00:00:00Z')
    expect(Date.parse(updated)).toBeGreaterThan(Date.parse('2024-01-01T00:00:00Z'))
  })
})

describe('extractViewerAssignment', () => {
  it('returns the assignment when the viewer owns a member', () => {
    const assignments = [
      {
        role: '공격',
        members: [
          { owner_id: 'viewer-1', hero_id: 'hero-a' },
          { owner_id: 'ally-2', hero_id: 'hero-b' },
        ],
      },
      {
        role: '수비',
        members: [{ owner_id: 'ally-3', hero_id: 'hero-c' }],
      },
    ]

    const assignment = extractViewerAssignment({ assignments, viewerId: 'viewer-1' })
    expect(assignment).toBe(assignments[0])
  })

  it('falls back to hero ownership when owner information is missing', () => {
    const assignments = [
      {
        role: '지원',
        members: [
          { owner_id: 'ally-10', hero_id: 'hero-extra' },
          { owner_id: 'ally-11', hero_id: 'hero-target' },
        ],
      },
    ]

    const assignment = extractViewerAssignment({
      assignments,
      viewerId: 'viewer-x',
      heroId: 'hero-target',
    })

    expect(assignment).toBe(assignments[0])
  })

  it('returns null when no members match the viewer or hero', () => {
    const assignments = [
      {
        role: '공격',
        members: [{ owner_id: 'ally-1', hero_id: 'hero-1' }],
      },
    ]

    const assignment = extractViewerAssignment({
      assignments,
      viewerId: 'viewer-none',
      heroId: 'hero-missing',
    })

    expect(assignment).toBeNull()
  })
})
