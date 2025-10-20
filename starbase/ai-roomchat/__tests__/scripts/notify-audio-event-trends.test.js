const { describe, it, expect } = require('@jest/globals')

const {
  normaliseBuckets,
  summariseTrend,
  buildSlackPayload,
  formatDelta,
  formatNumber,
  detectAnomaly,
  summariseHeroDistribution,
  buildDistributionSummary,
  describeFilters,
  describeSlack,
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

  it('builds Slack payload with anomaly and distribution', () => {
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
      anomaly: { badge: '🔺 급증 감지', message: '급증' },
      distribution: {
        lines: ['히어로 A 60% (6건)', '히어로 B 40% (4건)'],
      },
    })

    expect(payload.text).toContain('주간 추이')
    const anomalyBlock = payload.blocks.find((block) => block.type === 'context')
    expect(anomalyBlock.elements[0].text).toContain('급증')
    const listSection = payload.blocks.find((block) => block.type === 'section' && block.text.text.includes('09-22'))
    expect(listSection.text.text).toContain('• 09-22~09-28: 3건')
    const distributionSection = payload.blocks.find((block) =>
      block.type === 'section' && block.text.text.includes('히어로 분포'),
    )
    expect(distributionSection.text.text).toContain('히어로 A')
  })

  it('formats numbers with thousands separators', () => {
    expect(formatNumber(12345)).toBe('12,345')
    expect(formatNumber('6789')).toBe('6,789')
  })

  it('detects anomalies based on deltas', () => {
    const spike = detectAnomaly({
      direction: 'up',
      deltaPercent: 45,
      deltaCount: 12,
      current: { eventCount: 22 },
      previous: { eventCount: 10 },
    })
    expect(spike).toMatchObject({ type: 'spike' })

    const drop = detectAnomaly({
      direction: 'down',
      deltaPercent: -50,
      deltaCount: -15,
      current: { eventCount: 10 },
      previous: { eventCount: 25 },
    })
    expect(drop).toMatchObject({ type: 'drop' })

    const zeroed = detectAnomaly({
      direction: 'flat',
      deltaPercent: 0,
      deltaCount: -20,
      current: { eventCount: 0 },
      previous: { eventCount: 20 },
    })
    expect(zeroed).toMatchObject({ type: 'zeroed' })
  })

  it('summarises hero distribution', () => {
    const distribution = summariseHeroDistribution([
      { dimension_id: 'hero-a', dimension_label: '히어로 A', event_count: 6 },
      { dimension_id: 'hero-b', dimension_label: '히어로 B', event_count: 4 },
      { dimension_id: 'hero-a', dimension_label: '히어로 A', event_count: 2 },
    ])

    expect(distribution.total).toBe(12)
    expect(distribution.lines[0]).toContain('히어로 A')
    expect(buildDistributionSummary(distribution)).toContain('• 히어로 A')
  })

  it('includes subscription highlights in Slack payload', () => {
    const payload = buildSlackPayload({
      buckets: [],
      summary: null,
      lookbackWeeks: 4,
      generatedAt: new Date('2025-10-10T12:00:00Z'),
      anomaly: null,
      distribution: null,
      subscriptions: [
        {
          label: 'Ops Hero',
          notes: '주간 점검',
          count: 8,
          meetsThreshold: true,
          filters: { ownerId: 'owner-1', eventTypes: ['preset.update'] },
          slack: { channel: '#ops', mention: '@ops', minEvents: 5, lookbackWeeks: 4, alwaysInclude: false },
          anomaly: { badge: '🔺 급증 감지' },
        },
      ],
    })

    const subscriptionSection = payload.blocks.find(
      (block) => block.type === 'section' && block.text.text.includes('Ops Hero'),
    )
    expect(subscriptionSection.text.text).toContain('Ops Hero')
    expect(subscriptionSection.text.text).toContain('급증 감지')
    expect(subscriptionSection.text.text).toContain('#ops')
  })

  it('summarises filters and slack metadata for subscriptions', () => {
    const filtersText = describeFilters({ ownerId: 'owner-1', eventTypes: ['preset.update'], search: 'bgm' })
    expect(filtersText).toContain('owner owner-1')
    expect(filtersText).toContain('type preset.update')
    expect(filtersText).toContain('검색 "bgm"')

    const slackText = describeSlack({ channel: '#ops', mention: '@qa', minEvents: 3, lookbackWeeks: 6, alwaysInclude: true })
    expect(slackText).toContain('#ops')
    expect(slackText).toContain('@qa')
    expect(slackText).toContain('임계 3건 / 6주')
    expect(slackText).toContain('항상 포함')
  })
})
