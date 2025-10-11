const mockWithTable = jest.fn()

jest.mock('@/lib/supabaseTables', () => ({
  withTable: (...args) => mockWithTable(...args),
}))

import { fetchLatestSessionRow, loadMatchFlowSnapshot } from '@/modules/rank/matchRealtimeSync'

describe('fetchLatestSessionRow', () => {
  const originalWindow = global.window
  const originalFetch = global.fetch

  beforeEach(() => {
    mockWithTable.mockReset()
    if (typeof global.fetch !== 'undefined') {
      global.fetch = originalFetch
    }
    if (typeof global.window !== 'undefined') {
      delete global.window
    }
  })

  afterAll(() => {
    if (typeof originalWindow !== 'undefined') {
      global.window = originalWindow
    } else {
      delete global.window
    }
    if (typeof originalFetch !== 'undefined') {
      global.fetch = originalFetch
    } else {
      delete global.fetch
    }
  })

  it('returns the RPC payload when available', async () => {
    const supabaseClient = {
      rpc: jest.fn(() =>
        Promise.resolve({
          data: {
            id: 'session-1',
            status: 'active',
            owner_id: 'owner-1',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
            match_mode: 'standard',
          },
          error: null,
        }),
      ),
    }

    const result = await fetchLatestSessionRow(supabaseClient, 'game-1')

    expect(result).toEqual({
      id: 'session-1',
      status: 'active',
      owner_id: 'owner-1',
      ownerId: 'owner-1',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      mode: 'standard',
      match_mode: 'standard',
    })
    expect(mockWithTable).not.toHaveBeenCalled()
  })

  it('passes the owner filter when provided', async () => {
    const supabaseClient = {
      rpc: jest.fn(() =>
        Promise.resolve({
          data: [
            {
              id: 'session-2',
              status: 'active',
              owner_id: 'owner-2',
              created_at: null,
              updated_at: '2025-01-02T00:00:00Z',
              match_mode: 'standard',
            },
          ],
          error: null,
        }),
      ),
    }

    const result = await fetchLatestSessionRow(supabaseClient, 'game-3', { ownerId: 'owner-2' })

    expect(result).toEqual({
      id: 'session-2',
      status: 'active',
      owner_id: 'owner-2',
      ownerId: 'owner-2',
      created_at: null,
      updated_at: '2025-01-02T00:00:00Z',
      mode: 'standard',
      match_mode: 'standard',
    })
    expect(supabaseClient.rpc).toHaveBeenCalledWith(
      'fetch_latest_rank_session_v2',
      expect.objectContaining({ p_game_id: 'game-3', p_owner_id: 'owner-2' }),
    )
  })

  it('returns null when the RPC reports ambiguity', async () => {
    const supabaseClient = {
      rpc: jest.fn(() =>
        Promise.resolve({
          data: null,
          error: { code: 'PGRST203', message: 'ambiguous overload' },
        }),
      ),
    }

    const result = await fetchLatestSessionRow(supabaseClient, 'game-4')

    expect(result).toBeNull()
    expect(supabaseClient.rpc).toHaveBeenCalledWith('fetch_latest_rank_session_v2', {
      p_game_id: 'game-4',
    })
  })

  it('returns null when the RPC is missing', async () => {
    const supabaseClient = {
      rpc: jest.fn(() =>
        Promise.resolve({
          data: null,
          error: { code: '42883', message: 'undefined function' },
        }),
      ),
    }

    const result = await fetchLatestSessionRow(supabaseClient, 'game-2')

    expect(result).toBeNull()
    expect(supabaseClient.rpc).toHaveBeenCalledWith('fetch_latest_rank_session_v2', {
      p_game_id: 'game-2',
    })
  })

  it('uses the latest-session API in the browser', async () => {
    const supabaseClient = { rpc: jest.fn() }

    const originalWindow = global.window
    const originalFetch = global.fetch

    const mockResponse = {
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            session: {
              id: 'session-browser',
              status: 'ready',
              owner_id: 'owner-browser',
              created_at: '2025-03-01T12:00:00Z',
              updated_at: '2025-03-01T12:05:00Z',
              match_mode: 'pulse',
            },
          }),
        ),
    }

    global.fetch = jest.fn(() => Promise.resolve(mockResponse))
    global.window = { document: {}, fetch: global.fetch }

    const result = await fetchLatestSessionRow(supabaseClient, 'game-browser', {
      ownerId: 'owner-browser',
    })

    expect(result).toEqual({
      id: 'session-browser',
      status: 'ready',
      owner_id: 'owner-browser',
      ownerId: 'owner-browser',
      created_at: '2025-03-01T12:00:00Z',
      updated_at: '2025-03-01T12:05:00Z',
      mode: 'pulse',
      match_mode: 'pulse',
    })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/rank/latest-session',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(supabaseClient.rpc).not.toHaveBeenCalled()

    global.window = originalWindow
    global.fetch = originalFetch
  })

  it('emits diagnostics when the browser API fails', async () => {
    const supabaseClient = { rpc: jest.fn() }

    const originalWindow = global.window
    const originalFetch = global.fetch

    const failurePayload = {
      error: 'rpc_failed',
      supabaseError: { code: '42883', message: 'function does not exist' },
    }

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 502,
        text: () => Promise.resolve(JSON.stringify(failurePayload)),
      }),
    )
    global.window = { document: {}, fetch: global.fetch }

    const diagnostics = jest.fn()

    const result = await fetchLatestSessionRow(supabaseClient, 'game-missing', {
      onDiagnostics: diagnostics,
    })

    expect(result).toBeNull()
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'latest-session-api',
        hint: expect.stringContaining('fetch_latest_rank_session_v2'),
      }),
    )

    global.window = originalWindow
    global.fetch = originalFetch
  })

  it('emits diagnostics when the browser API reports a 200 response with RPC metadata', async () => {
    const supabaseClient = { rpc: jest.fn() }

    const originalWindow = global.window
    const originalFetch = global.fetch

    const payload = {
      error: 'rpc_failed',
      supabaseError: { code: '42809', message: 'WITHIN GROUP is required for ordered-set aggregate mode' },
      hint: 'ordered-set aggregate requires WITHIN GROUP',
      session: null,
      via: 'table-error',
    }

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(payload)),
      }),
    )
    global.window = { document: {}, fetch: global.fetch }

    const diagnostics = jest.fn()

    const result = await fetchLatestSessionRow(supabaseClient, 'game-ordered-set', {
      onDiagnostics: diagnostics,
    })

    expect(result).toBeNull()
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'latest-session-api',
        hint: expect.stringContaining('WITHIN GROUP'),
      }),
    )
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/rank/latest-session',
      expect.objectContaining({ method: 'POST' }),
    )

    global.window = originalWindow
    global.fetch = originalFetch
  })

  it('returns a session row when the browser API recovers from an ordered-set error', async () => {
    const supabaseClient = { rpc: jest.fn() }

    const originalWindow = global.window
    const originalFetch = global.fetch

    const payload = {
      session: {
        id: 'session-ordered-set',
        status: 'ready',
        owner_id: 'owner-ordered',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      },
      via: 'table-ordered-set-recovery',
      orderedSetRecovered: true,
      diagnostics: {
        via: 'table-ordered-set-recovery',
        orderedSetRecovered: true,
        hintSuppressed: true,
      },
    }

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(payload)),
      }),
    )
    global.window = { document: {}, fetch: global.fetch }

    const diagnostics = jest.fn()

    const result = await fetchLatestSessionRow(supabaseClient, 'game-ordered-set', {
      onDiagnostics: diagnostics,
    })

    expect(result).toMatchObject({
      id: 'session-ordered-set',
      status: 'ready',
      ownerId: 'owner-ordered',
    })
    expect(diagnostics).not.toHaveBeenCalled()

    global.window = originalWindow
    global.fetch = originalFetch
  })

  it('emits an ordered-set hint when the browser API reports a WITHIN GROUP error', async () => {
    const supabaseClient = { rpc: jest.fn() }

    const originalWindow = global.window
    const originalFetch = global.fetch

    const failurePayload = {
      error: 'rpc_failed',
      supabaseError: {
        code: '42809',
        message: 'WITHIN GROUP is required for ordered-set aggregate mode',
        details: 'ordered-set aggregate needs WITHIN GROUP',
      },
    }

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 502,
        text: () => Promise.resolve(JSON.stringify(failurePayload)),
      }),
    )
    global.window = { document: {}, fetch: global.fetch }

    const diagnostics = jest.fn()

    const result = await fetchLatestSessionRow(supabaseClient, 'game-ordered-set', {
      onDiagnostics: diagnostics,
    })

    expect(result).toBeNull()
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'latest-session-api',
        hint: expect.stringContaining('WITHIN GROUP'),
      }),
    )

    global.window = originalWindow
    global.fetch = originalFetch
  })
})

describe('loadMatchFlowSnapshot', () => {
  beforeEach(() => {
    mockWithTable.mockReset()
    if (typeof global.window !== 'undefined') {
      delete global.window
    }
    if (typeof global.fetch !== 'undefined') {
      delete global.fetch
    }
  })

  it('throws an ordered-set aggregate error when the snapshot RPC fails without WITHIN GROUP', async () => {
    const supabaseClient = {
      rpc: jest.fn(() =>
        Promise.resolve({
          data: null,
          error: {
            code: 'XX000',
            message: 'WITHIN GROUP is required for ordered-set aggregate mode',
            details: 'ordered-set aggregate needs WITHIN GROUP',
          },
        }),
      ),
    }

    await expect(loadMatchFlowSnapshot(supabaseClient, 'game-error')).rejects.toMatchObject({
      code: 'ordered_set_aggregate',
      hint: expect.stringContaining('WITHIN GROUP'),
    })
    expect(mockWithTable).not.toHaveBeenCalled()
  })

  it('throws a snapshot return type mismatch error when the RPC body is misconfigured', async () => {
    const supabaseClient = {
      rpc: jest.fn(() =>
        Promise.resolve({
          data: null,
          error: {
            code: '42P13',
            message: 'return type mismatch in function declared to return jsonb',
            details: 'Function\'s final statement must be SELECT',
          },
        }),
      ),
    }

    await expect(loadMatchFlowSnapshot(supabaseClient, 'game-return-error')).rejects.toMatchObject({
      code: 'snapshot_return_type_mismatch',
      hint: expect.stringContaining('PL/pgSQL'),
    })
    expect(mockWithTable).not.toHaveBeenCalled()
  })

  it('throws a snapshot SQL syntax error when the RPC was pasted with placeholders', async () => {
    const supabaseClient = {
      rpc: jest.fn(() =>
        Promise.resolve({
          data: null,
          error: {
            code: '42601',
            message: 'syntax error at or near ".."',
            details: "LINE 15: 'roster', coalesce( ... )",
          },
        }),
      ),
    }

    await expect(loadMatchFlowSnapshot(supabaseClient, 'game-syntax-error')).rejects.toMatchObject({
      code: 'snapshot_sql_syntax_error',
      hint: expect.stringContaining('docs/sql/fetch-rank-match-ready-snapshot.sql'),
    })
    expect(mockWithTable).not.toHaveBeenCalled()
  })

  it('maps the RPC snapshot payload into the match-ready structure', async () => {
    const rpcPayload = {
      roster: [
        {
          id: 'roster-1',
          match_instance_id: 'match-1',
          room_id: 'room-1',
          game_id: 'game-1',
          slot_id: 'slot-1',
          slot_index: 0,
          role: '전략가',
          owner_id: 'owner-1',
          hero_id: 'hero-1',
          hero_name: '알파',
          hero_summary: { name: '알파' },
          ready: true,
          joined_at: '2025-01-01T00:00:00Z',
          slot_template_version: 7,
          slot_template_source: 'room-stage',
          slot_template_updated_at: '2025-01-01T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ],
      room: {
        id: 'room-1',
        owner_id: 'owner-1',
        code: 'ROOM-1',
        status: 'ready',
        mode: '랭크',
        realtime_mode: 'standard',
        host_role_limit: 2,
        blind_mode: false,
        score_window: 60,
        updated_at: '2025-01-01T00:00:00Z',
        game_id: 'game-1',
      },
      session: {
        id: 'session-1',
        status: 'ready',
        owner_id: 'owner-1',
        mode: '랭크',
        match_mode: '랭크',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:10:00Z',
      },
      session_meta: {
        session_id: 'session-1',
        selected_time_limit_seconds: 120,
        updated_at: '2025-01-01T00:10:00Z',
      },
      slot_template_version: 7,
      slot_template_source: 'room-stage',
      slot_template_updated_at: '2025-01-01T00:00:00Z',
    }

    const supabaseClient = {
      rpc: jest.fn(() => Promise.resolve({ data: rpcPayload, error: null })),
    }

    const snapshot = await loadMatchFlowSnapshot(supabaseClient, 'game-1')

    expect(snapshot).toMatchObject({
      roster: [
        {
          slotIndex: 0,
          role: '전략가',
          ownerId: 'owner-1',
          ready: true,
        },
      ],
      roomId: 'room-1',
      sessionId: 'session-1',
      slotTemplateVersion: 7,
      realtimeMode: 'standard',
      hostOwnerId: 'owner-1',
    })
    expect(snapshot.matchSnapshot?.match?.roles?.[0]?.role).toBe('전략가')
    expect(mockWithTable).not.toHaveBeenCalled()
  })

  it('fills pending async seats with stand-in candidates', async () => {
    const rpcPayload = {
      roster: [
        {
          id: 'roster-host',
          match_instance_id: 'match-async',
          room_id: 'room-async',
          game_id: 'game-async',
          slot_id: 'slot-0',
          slot_index: 0,
          role: '전략가',
          owner_id: 'host-owner',
          hero_id: 'hero-host',
          hero_name: '호스트',
          ready: true,
          joined_at: '2025-02-01T00:00:00Z',
          slot_template_version: 9,
          slot_template_source: 'room-stage',
          slot_template_updated_at: '2025-02-01T00:00:00Z',
          created_at: '2025-02-01T00:00:00Z',
          updated_at: '2025-02-01T00:00:00Z',
        },
        {
          id: 'roster-pending',
          match_instance_id: 'match-async',
          room_id: 'room-async',
          game_id: 'game-async',
          slot_id: 'slot-1',
          slot_index: 1,
          role: '전략가',
          owner_id: null,
          hero_id: null,
          hero_name: null,
          ready: false,
          joined_at: null,
          slot_template_version: 9,
          slot_template_source: 'room-stage',
          slot_template_updated_at: '2025-02-01T00:00:00Z',
          created_at: '2025-02-01T00:00:00Z',
          updated_at: '2025-02-01T00:00:00Z',
        },
      ],
      room: {
        id: 'room-async',
        owner_id: 'host-owner',
        code: 'ASYNC-ROOM',
        status: 'ready',
        mode: 'standard',
        realtime_mode: 'off',
        host_role_limit: 2,
        blind_mode: false,
        score_window: 30,
        updated_at: '2025-02-01T00:00:00Z',
        game_id: 'game-async',
      },
      session: {
        id: 'session-async',
        status: 'active',
        owner_id: 'host-owner',
        mode: 'standard',
        match_mode: 'standard',
        created_at: '2025-02-01T00:00:00Z',
        updated_at: '2025-02-01T00:05:00Z',
      },
      session_meta: {
        session_id: 'session-async',
        async_fill_snapshot: {
          mode: 'off',
          hostOwnerId: 'host-owner',
          hostRole: '전략가',
          seatLimit: { allowed: 2, total: 2 },
          seatIndexes: [0, 1],
          pendingSeatIndexes: [1],
          assigned: [
            {
              slotIndex: 0,
              slotId: 'slot-0',
              ownerId: 'host-owner',
              heroId: 'hero-host',
              heroName: '호스트',
              ready: true,
              joinedAt: '2025-02-01T00:00:00Z',
            },
          ],
          fillQueue: [
            {
              ownerId: 'standin-owner',
              heroId: 'hero-standin',
              heroName: '대역 AI',
              score: 1234,
              rating: 1500,
              winRate: 52.5,
              battles: 88,
              status: 'waiting',
              joinedAt: '2025-02-01T00:02:00Z',
            },
          ],
          poolSize: 1,
          generatedAt: 1700000000000,
        },
        updated_at: '2025-02-01T00:05:00Z',
      },
      slot_template_version: 9,
      slot_template_source: 'room-stage',
      slot_template_updated_at: '2025-02-01T00:00:00Z',
    }

    const supabaseClient = {
      rpc: jest.fn((fnName) => {
        if (fnName === 'fetch_rank_match_ready_snapshot') {
          return Promise.resolve({ data: rpcPayload, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      }),
    }

    const snapshot = await loadMatchFlowSnapshot(supabaseClient, 'game-async')

    expect(snapshot.roster).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerId: 'host-owner', standin: false }),
        expect.objectContaining({
          ownerId: 'standin-owner',
          standin: true,
          heroId: 'hero-standin',
          matchSource: 'participant_pool',
        }),
      ]),
    )
    expect(snapshot.participantPool).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerId: 'standin-owner', standin: true }),
      ]),
    )
    expect(snapshot.sessionMeta?.asyncFill?.pendingSeatIndexes).toEqual([])
    expect(snapshot.sessionMeta?.asyncFill?.fillQueue).toHaveLength(0)
    expect(snapshot.sessionMeta?.asyncFill?.assigned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerId: 'standin-owner', slotIndex: 1 }),
      ]),
    )
    expect(snapshot.matchSnapshot?.match?.roles?.[0]?.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerId: 'standin-owner', standin: true }),
      ]),
    )
    expect(snapshot.heroMap).toMatchObject({
      'hero-standin': expect.objectContaining({ name: '대역 AI' }),
    })
  })

  it('creates placeholder roster entries when async seats are missing', async () => {
    const rpcPayload = {
      roster: [
        {
          id: 'roster-host',
          match_instance_id: 'match-async',
          room_id: 'room-async',
          game_id: 'game-async',
          slot_id: 'slot-0',
          slot_index: 0,
          role: '전략가',
          owner_id: 'host-owner',
          hero_id: 'hero-host',
          hero_name: '호스트',
          ready: true,
          joined_at: '2025-02-01T00:00:00Z',
          slot_template_version: 9,
          slot_template_source: 'room-stage',
          slot_template_updated_at: '2025-02-01T00:00:00Z',
          created_at: '2025-02-01T00:00:00Z',
          updated_at: '2025-02-01T00:00:00Z',
        },
      ],
      room: {
        id: 'room-async',
        owner_id: 'host-owner',
        code: 'ASYNC-ROOM',
        status: 'ready',
        mode: 'standard',
        realtime_mode: 'off',
        host_role_limit: 2,
        blind_mode: false,
        score_window: 30,
        updated_at: '2025-02-01T00:00:00Z',
        game_id: 'game-async',
      },
      session: {
        id: 'session-async',
        status: 'active',
        owner_id: 'host-owner',
        mode: 'standard',
        match_mode: 'standard',
        created_at: '2025-02-01T00:00:00Z',
        updated_at: '2025-02-01T00:05:00Z',
      },
      session_meta: {
        session_id: 'session-async',
        async_fill_snapshot: {
          mode: 'off',
          hostOwnerId: 'host-owner',
          hostRole: '전략가',
          seatLimit: { allowed: 2, total: 2 },
          seatIndexes: [0, 1],
          pendingSeatIndexes: [1],
          assigned: [
            {
              slotIndex: 0,
              slotId: 'slot-0',
              ownerId: 'host-owner',
              heroId: 'hero-host',
              heroName: '호스트',
              ready: true,
              joinedAt: '2025-02-01T00:00:00Z',
            },
          ],
          fillQueue: [
            {
              ownerId: 'standin-owner',
              heroId: 'hero-standin',
              heroName: '대역 AI',
              score: 1500,
              rating: 1800,
              winRate: 51.2,
              battles: 42,
              status: 'waiting',
              joinedAt: '2025-02-01T00:02:00Z',
            },
          ],
          poolSize: 1,
          generatedAt: 1700000000000,
        },
        updated_at: '2025-02-01T00:05:00Z',
      },
      slot_template_version: 9,
      slot_template_source: 'room-stage',
      slot_template_updated_at: '2025-02-01T00:00:00Z',
    }

    const supabaseClient = {
      rpc: jest.fn((fnName) => {
        if (fnName === 'fetch_rank_match_ready_snapshot') {
          return Promise.resolve({ data: rpcPayload, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      }),
    }

    const snapshot = await loadMatchFlowSnapshot(supabaseClient, 'game-async')

    expect(snapshot.roster).toHaveLength(2)
    const standinSeat = snapshot.roster.find((entry) => entry.slotIndex === 1)
    expect(standinSeat).toMatchObject({
      ownerId: 'standin-owner',
      standin: true,
      role: '전략가',
      ready: true,
      matchSource: 'participant_pool',
    })
    expect(snapshot.sessionMeta?.asyncFill?.pendingSeatIndexes).toEqual([])
    expect(snapshot.sessionMeta?.asyncFill?.fillQueue).toHaveLength(0)
  })

  it('prefers stand-in candidates that match the pending seat role', async () => {
    const rpcPayload = {
      roster: [
        {
          id: 'roster-host',
          match_instance_id: 'match-async-role',
          room_id: 'room-async-role',
          game_id: 'game-async-role',
          slot_id: 'slot-0',
          slot_index: 0,
          role: '전략가',
          owner_id: 'host-owner',
          hero_id: 'hero-host',
          hero_name: '호스트',
          ready: true,
          joined_at: '2025-02-01T00:00:00Z',
          score: 1800,
          rating: 1480,
          slot_template_version: 4,
          slot_template_source: 'room-stage',
          slot_template_updated_at: '2025-02-01T00:00:00Z',
          created_at: '2025-02-01T00:00:00Z',
          updated_at: '2025-02-01T00:00:00Z',
        },
        {
          id: 'roster-pending',
          match_instance_id: 'match-async-role',
          room_id: 'room-async-role',
          game_id: 'game-async-role',
          slot_id: 'slot-1',
          slot_index: 1,
          role: '수호자',
          owner_id: null,
          hero_id: null,
          hero_name: null,
          ready: false,
          joined_at: null,
          score: 1725,
          rating: 1520,
          slot_template_version: 4,
          slot_template_source: 'room-stage',
          slot_template_updated_at: '2025-02-01T00:00:00Z',
          created_at: '2025-02-01T00:00:00Z',
          updated_at: '2025-02-01T00:00:00Z',
        },
      ],
      room: {
        id: 'room-async-role',
        owner_id: 'host-owner',
        code: 'ASYNC-ROLE',
        status: 'ready',
        mode: 'standard',
        realtime_mode: 'off',
        host_role_limit: 2,
        blind_mode: false,
        score_window: 30,
        updated_at: '2025-02-01T00:00:00Z',
        game_id: 'game-async-role',
      },
      session: {
        id: 'session-async-role',
        status: 'active',
        owner_id: 'host-owner',
        mode: 'standard',
        match_mode: 'standard',
        created_at: '2025-02-01T00:00:00Z',
        updated_at: '2025-02-01T00:05:00Z',
      },
      session_meta: {
        session_id: 'session-async-role',
        async_fill_snapshot: {
          mode: 'off',
          hostOwnerId: 'host-owner',
          hostRole: '전략가',
          seatLimit: { allowed: 2, total: 2 },
          seatIndexes: [0, 1],
          pendingSeatIndexes: [1],
          assigned: [
            {
              slotIndex: 0,
              slotId: 'slot-0',
              ownerId: 'host-owner',
              heroId: 'hero-host',
              heroName: '호스트',
              ready: true,
              joinedAt: '2025-02-01T00:00:00Z',
            },
          ],
          fillQueue: [
            {
              ownerId: 'queue-mismatch',
              heroId: 'hero-mismatch',
              heroName: '역할 불일치',
              role: '지원가',
              score: 1900,
              rating: 1700,
              status: 'waiting',
              joinedAt: '2025-02-01T00:01:00Z',
            },
            {
              ownerId: 'queue-match',
              heroId: 'hero-standin',
              heroName: '대역 수호자',
              role: '수호자',
              score: 1720,
              rating: 1510,
              status: 'waiting',
              joinedAt: '2025-02-01T00:02:00Z',
            },
          ],
          poolSize: 2,
          generatedAt: 1700000500000,
        },
        updated_at: '2025-02-01T00:05:00Z',
      },
      slot_template_version: 4,
      slot_template_source: 'room-stage',
      slot_template_updated_at: '2025-02-01T00:00:00Z',
    }

    const supabaseClient = {
      rpc: jest.fn((fnName) => {
        if (fnName === 'fetch_rank_match_ready_snapshot') {
          return Promise.resolve({ data: rpcPayload, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      }),
    }

    const snapshot = await loadMatchFlowSnapshot(supabaseClient, 'game-async-role')

    const standinSeat = snapshot.roster.find((entry) => entry.slotIndex === 1)
    expect(standinSeat).toMatchObject({ ownerId: 'queue-match', standin: true, role: '수호자' })
    expect(standinSeat.rating).toBe(1510)

    expect(snapshot.sessionMeta?.asyncFill?.fillQueue).toHaveLength(1)
    expect(snapshot.sessionMeta?.asyncFill?.fillQueue?.[0]).toMatchObject({ ownerId: 'queue-mismatch' })
    const assigned = snapshot.sessionMeta?.asyncFill?.assigned || []
    expect(assigned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerId: 'queue-match', slotIndex: 1, role: '수호자', rating: 1510 }),
      ]),
    )
  })

  it('chooses the closest rating stand-in when multiple candidates share the role', async () => {
    const rpcPayload = {
      roster: [
        {
          id: 'roster-host',
          match_instance_id: 'match-async-rating',
          room_id: 'room-async-rating',
          game_id: 'game-async-rating',
          slot_id: 'slot-0',
          slot_index: 0,
          role: '전략가',
          owner_id: 'host-owner',
          hero_id: 'hero-host',
          hero_name: '호스트',
          ready: true,
          joined_at: '2025-02-01T00:00:00Z',
          score: 1820,
          rating: 1490,
          slot_template_version: 5,
          slot_template_source: 'room-stage',
          slot_template_updated_at: '2025-02-01T00:00:00Z',
          created_at: '2025-02-01T00:00:00Z',
          updated_at: '2025-02-01T00:00:00Z',
        },
        {
          id: 'roster-pending',
          match_instance_id: 'match-async-rating',
          room_id: 'room-async-rating',
          game_id: 'game-async-rating',
          slot_id: 'slot-1',
          slot_index: 1,
          role: '수호자',
          owner_id: null,
          hero_id: null,
          hero_name: null,
          ready: false,
          joined_at: null,
          score: 1750,
          rating: 1500,
          slot_template_version: 5,
          slot_template_source: 'room-stage',
          slot_template_updated_at: '2025-02-01T00:00:00Z',
          created_at: '2025-02-01T00:00:00Z',
          updated_at: '2025-02-01T00:00:00Z',
        },
      ],
      room: {
        id: 'room-async-rating',
        owner_id: 'host-owner',
        code: 'ASYNC-RATING',
        status: 'ready',
        mode: 'standard',
        realtime_mode: 'off',
        host_role_limit: 2,
        blind_mode: false,
        score_window: 30,
        updated_at: '2025-02-01T00:00:00Z',
        game_id: 'game-async-rating',
      },
      session: {
        id: 'session-async-rating',
        status: 'active',
        owner_id: 'host-owner',
        mode: 'standard',
        match_mode: 'standard',
        created_at: '2025-02-01T00:00:00Z',
        updated_at: '2025-02-01T00:05:00Z',
      },
      session_meta: {
        session_id: 'session-async-rating',
        async_fill_snapshot: {
          mode: 'off',
          hostOwnerId: 'host-owner',
          hostRole: '전략가',
          seatLimit: { allowed: 2, total: 2 },
          seatIndexes: [0, 1],
          pendingSeatIndexes: [1],
          assigned: [
            {
              slotIndex: 0,
              slotId: 'slot-0',
              ownerId: 'host-owner',
              heroId: 'hero-host',
              heroName: '호스트',
              ready: true,
              joinedAt: '2025-02-01T00:00:00Z',
            },
          ],
          fillQueue: [
            {
              ownerId: 'queue-distant',
              heroId: 'hero-distant',
              heroName: '멀리 있는 수호자',
              role: '수호자',
              score: 2100,
              rating: 1800,
              status: 'waiting',
              joinedAt: '2025-02-01T00:01:00Z',
            },
            {
              ownerId: 'queue-close',
              heroId: 'hero-close',
              heroName: '근접 수호자',
              role: '수호자',
              score: 1760,
              rating: 1515,
              status: 'waiting',
              joinedAt: '2025-02-01T00:02:00Z',
            },
          ],
          poolSize: 2,
          generatedAt: 1700000600000,
        },
        updated_at: '2025-02-01T00:05:00Z',
      },
      slot_template_version: 5,
      slot_template_source: 'room-stage',
      slot_template_updated_at: '2025-02-01T00:00:00Z',
    }

    const supabaseClient = {
      rpc: jest.fn((fnName) => {
        if (fnName === 'fetch_rank_match_ready_snapshot') {
          return Promise.resolve({ data: rpcPayload, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      }),
    }

    const snapshot = await loadMatchFlowSnapshot(supabaseClient, 'game-async-rating')

    const standinSeat = snapshot.roster.find((entry) => entry.slotIndex === 1)
    expect(standinSeat).toMatchObject({ ownerId: 'queue-close', standin: true })
    expect(standinSeat.rating).toBe(1515)

    expect(snapshot.sessionMeta?.asyncFill?.fillQueue).toHaveLength(1)
    expect(snapshot.sessionMeta?.asyncFill?.fillQueue?.[0]).toMatchObject({ ownerId: 'queue-distant' })
    const assigned = snapshot.sessionMeta?.asyncFill?.assigned || []
    expect(assigned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerId: 'queue-close', slotIndex: 1, rating: 1515 }),
      ]),
    )
  })

  it('raises a latest-session hint when the RPC is unavailable', async () => {
    mockWithTable.mockImplementation(() => Promise.resolve({ data: null, error: null }))

    const supabaseClient = {
      rpc: jest.fn((fnName) => {
        if (fnName === 'fetch_rank_match_ready_snapshot') {
          return Promise.resolve({
            data: {
              roster: [],
              room: null,
              session: null,
              session_meta: null,
            },
            error: null,
          })
        }
        if (fnName === 'fetch_latest_rank_session_v2') {
          return Promise.resolve({
            data: null,
            error: { code: '42883', message: 'function does not exist' },
          })
        }
        return Promise.resolve({ data: null, error: null })
      }),
    }

    await expect(loadMatchFlowSnapshot(supabaseClient, 'game-latest-missing')).rejects.toMatchObject({
      code: 'latest_session_unavailable',
      hint: expect.stringContaining('fetch_latest_rank_session_v2'),
    })
  })

  it('raises an ordered-set hint when the latest-session RPC is missing WITHIN GROUP', async () => {
    mockWithTable.mockImplementation(() => Promise.resolve({ data: null, error: null }))

    const supabaseClient = {
      rpc: jest.fn((fnName) => {
        if (fnName === 'fetch_rank_match_ready_snapshot') {
          return Promise.resolve({
            data: {
              roster: [],
              room: null,
              session: null,
              session_meta: null,
            },
            error: null,
          })
        }
        if (fnName === 'fetch_latest_rank_session_v2') {
          return Promise.resolve({
            data: null,
            error: {
              code: '42809',
              message: 'WITHIN GROUP is required for ordered-set aggregate mode',
              details: 'ordered-set aggregate needs WITHIN GROUP',
            },
          })
        }
        return Promise.resolve({ data: null, error: null })
      }),
    }

    await expect(loadMatchFlowSnapshot(supabaseClient, 'game-latest-ordered-set')).rejects.toMatchObject({
      code: 'latest_session_unavailable',
      hint: expect.stringContaining('WITHIN GROUP'),
    })
  })
})
