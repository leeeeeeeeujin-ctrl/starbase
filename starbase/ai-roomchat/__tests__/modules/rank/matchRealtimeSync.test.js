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
      'fetch_latest_rank_session',
      expect.objectContaining({ p_game_id: 'game-3', p_owner_id: 'owner-2' }),
    )
  })

  it('returns null when the RPC is unavailable to avoid legacy table queries', async () => {
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
