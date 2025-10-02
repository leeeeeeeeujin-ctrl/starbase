const { describe, it, expect } = require('@jest/globals')

const {
  normaliseBuckets,
  summariseTrend,
  buildSlackPayload,
  formatDelta,
  formatNumber,
} = require('../../scripts/notify-audio-event-trends')

describe('notify-audio-event-trends helpers', () => {
  it('normalises buckets and fills gaps', () => {
    const now = new Date('2025-10-10T12:00:00Z')
    const buckets = normaliseBuckets(
      [
        { week_start: '2025-09-22T00:00:00Z', event_count: 4, unique_owners: 2, unique_profiles: 3 },
        { week_start: '2025-10-06T00:00:00Z', event_count: 7, unique_owners: 3, unique_profiles: 5 },
      ],
      { now, weeks: 4 },
    )

    expect(buckets).toHaveLength(4)
    expect(buckets[0].eventCount).toBe(0)
    expect(buckets[1]).toMatchObject({ eventCount: 4, uniqueOwners: 2, uniqueProfiles: 3 })
    expect(buckets[3]).toMatchObject({ eventCount: 7, uniqueOwners: 3, uniqueProfiles: 5 })
  })

  it('summarises trend deltas', () => {
    const summary = summariseTrend([
      { weekStart: '2025-09-22T00:00:00Z', eventCount: 2, uniqueOwners: 1, uniqueProfiles: 1 },
      { weekStart: '2025-09-29T00:00:00Z', eventCount: 5, uniqueOwners: 3, uniqueProfiles: 3 },
    ])

    expect(summary.direction).toBe('up')
    expect(summary.deltaCount).toBe(3)
    expect(summary.deltaPercent).toBeCloseTo(150)
  })

  it('formats delta strings', () => {
    const summary = {
      current: { eventCount: 4 },
      previous: { eventCount: 0 },
      deltaCount: 4,
      deltaPercent: 100,
    }
    expect(formatDelta(summary)).toBe('신규 +4건')

    const summaryDown = {
      current: { eventCount: 2 },
      previous: { eventCount: 4 },
      deltaCount: -2,
      deltaPercent: -50,
    }
    expect(formatDelta(summaryDown)).toBe('−2건 (50.0%)')
  })

  it('builds Slack payload with list items', () => {
    const now = new Date('2025-10-10T12:00:00Z')
    const payload = buildSlackPayload({
      buckets: [
        { weekStart: '2025-09-22T00:00:00Z', eventCount: 3, uniqueOwners: 2, uniqueProfiles: 2 },
        { weekStart: '2025-09-29T00:00:00Z', eventCount: 5, uniqueOwners: 3, uniqueProfiles: 4 },
      ],
      summary: {
        current: { eventCount: 5, uniqueOwners: 3 },
        previous: { eventCount: 3, uniqueOwners: 2 },
        deltaCount: 2,
        deltaPercent: 66.666,
      },
      lookbackWeeks: 2,
      generatedAt: now,
    })

    expect(payload.text).toContain('주간 추이')
    expect(payload.blocks[1].text.text).toContain('지난 주')
    expect(payload.blocks[3].type).toBe('divider')
    expect(payload.blocks[4].text.text).toContain('• 09-22~09-28: 3건')
  })

  it('formats numbers with thousands separators', () => {
    expect(formatNumber(12345)).toBe('12,345')
    expect(formatNumber('6789')).toBe('6,789')
  })
})
