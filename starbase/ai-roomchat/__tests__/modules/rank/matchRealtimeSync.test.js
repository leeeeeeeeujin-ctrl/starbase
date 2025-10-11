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
      updated_at: '2025-01-01T00:00:00Z',
      mode: 'standard',
    })
    expect(mockWithTable).not.toHaveBeenCalled()
  })

  it('falls back to the table query when the RPC is unavailable', async () => {
    const supabaseClient = {
      rpc: jest.fn(() =>
        Promise.resolve({
          data: null,
          error: { code: '42883', message: 'undefined function' },
        }),
      ),
    }

    mockWithTable
      .mockImplementationOnce(async () => ({
        data: null,
        error: { code: 'PGRST100', message: 'Bad request' },
        table: 'rank_sessions',
      }))
      .mockImplementationOnce(async () => ({
        data: {
          id: 'session-2',
          status: 'ready',
          owner_id: 'owner-9',
          updated_at: '2025-02-02T00:00:00Z',
          mode: 'pulse',
        },
        error: null,
        table: 'rank_sessions',
      }))

    const result = await fetchLatestSessionRow(supabaseClient, 'game-2')

    expect(result).toEqual({
      id: 'session-2',
      status: 'ready',
      owner_id: 'owner-9',
      ownerId: 'owner-9',
      updated_at: '2025-02-02T00:00:00Z',
      mode: 'pulse',
    })
    expect(mockWithTable).toHaveBeenCalledTimes(2)
  })
})
