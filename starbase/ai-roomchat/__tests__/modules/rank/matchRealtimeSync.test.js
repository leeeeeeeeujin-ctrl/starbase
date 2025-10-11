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
})

describe('loadMatchFlowSnapshot', () => {
  beforeEach(() => {
    mockWithTable.mockReset()
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
})
