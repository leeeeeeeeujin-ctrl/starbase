import { buildHistorySeedEntries } from '@/lib/rank/historySeeds'

describe('buildHistorySeedEntries', () => {
  it('returns empty array for invalid payloads', () => {
    expect(buildHistorySeedEntries(null)).toEqual([])
    expect(buildHistorySeedEntries({})).toEqual([])
  })

  it('normalizes turns including hidden entries for AI memory', () => {
    const sessionHistory = {
      turns: [
        {
          idx: 5,
          role: 'system',
          content: 'Hidden directive',
          public: false,
          isVisible: false,
          createdAt: '2025-11-09T12:00:00Z',
        },
      ],
    }

    const result = buildHistorySeedEntries(sessionHistory)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      role: 'system',
      content: 'Hidden directive',
      public: false,
      includeInAi: true,
      meta: {
        seeded: true,
        turnIdx: 5,
        createdAt: '2025-11-09T12:00:00Z',
      },
    })
  })

  it('respects suppression flags from metadata and summary payloads', () => {
    const sessionHistory = {
      turns: [
        {
          idx: 3,
          role: 'assistant',
          content: 'Skip me',
          metadata: { includeInAi: false },
        },
        {
          idx: 4,
          role: 'assistant',
          content: 'Also skip',
          summaryPayload: { extra: { suppressAi: true } },
        },
      ],
    }

    const result = buildHistorySeedEntries(sessionHistory)
    expect(result).toHaveLength(2)
    expect(result[0].includeInAi).toBe(false)
    expect(result[1].includeInAi).toBe(false)
  })
})
