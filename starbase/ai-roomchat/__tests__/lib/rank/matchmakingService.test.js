import { loadMatchSampleSource } from '@/lib/rank/matchmakingService'

function createSupabaseStub(tableData = {}) {
  return {
    from(table) {
      const rows = tableData[table] || []
      return createQueryBuilder(rows)
    },
  }
}

function createQueryBuilder(rows) {
  const filters = []
  let orderConfig = null

  const builder = {
    select() {
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
    then(resolve, reject) {
      try {
        let data = Array.isArray(rows) ? [...rows] : []
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
        const payload = { data, error: null }
        return Promise.resolve(payload).then(resolve, reject)
      } catch (error) {
        const payload = { data: null, error }
        return Promise.resolve(payload).then(resolve, reject)
      }
    },
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

  it('injects stand-ins from participant pool after the wait threshold', async () => {
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

    expect(result.sampleType).toBe('realtime_queue_with_standins')
    expect(result.entries).toHaveLength(2)
    expect(result.standinCount).toBe(1)
    expect(result.queueWaitSeconds).toBeGreaterThanOrEqual(30)
    const standin = result.entries.find((entry) => entry.standin)
    expect(standin).toBeTruthy()
    expect(standin.match_source).toBe('participant_pool')
  })
})
