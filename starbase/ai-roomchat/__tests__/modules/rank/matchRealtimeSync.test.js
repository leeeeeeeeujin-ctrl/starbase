const mockWithTable = jest.fn()

jest.mock('@/lib/supabaseTables', () => ({
  withTable: (...args) => mockWithTable(...args),
}))

import { fetchLatestSessionRow } from '@/modules/rank/matchRealtimeSync'

describe('fetchLatestSessionRow', () => {
  beforeEach(() => {
    mockWithTable.mockReset()
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
            mode: 'standard',
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
              mode: 'standard',
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
    })
    expect(supabaseClient.rpc).toHaveBeenCalledWith(
      'fetch_latest_rank_session_v2',
      expect.objectContaining({ p_game_id: 'game-3', p_owner_id: 'owner-2' }),
    )
  })

  it('falls back to the legacy RPC name when v2 is ambiguous', async () => {
    const supabaseClient = {
      rpc: jest
        .fn()
        .mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST203', message: 'ambiguous overload' },
        })
        .mockResolvedValueOnce({
          data: {
            id: 'session-3',
            status: 'ready',
            owner_id: 'owner-3',
            created_at: '2025-01-03T00:00:00Z',
            updated_at: '2025-01-03T00:00:00Z',
            mode: 'pulse',
          },
          error: null,
        }),
    }

    const result = await fetchLatestSessionRow(supabaseClient, 'game-4')

    expect(result).toEqual({
      id: 'session-3',
      status: 'ready',
      owner_id: 'owner-3',
      ownerId: 'owner-3',
      created_at: '2025-01-03T00:00:00Z',
      updated_at: '2025-01-03T00:00:00Z',
      mode: 'pulse',
    })
    expect(mockWithTable).not.toHaveBeenCalled()
  })

  it('returns null when all RPC attempts fail', async () => {
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
    expect(mockWithTable).not.toHaveBeenCalled()
  })
})
