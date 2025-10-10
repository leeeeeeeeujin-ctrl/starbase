import { buildDropInExtensionTimelineEvent } from '@/lib/rank/dropInTimeline'

describe('buildDropInExtensionTimelineEvent', () => {
  it('creates an applied bonus event when deadline is active', () => {
    const now = 1700000000000
    const meta = {
      status: 'bonus-applied',
      queueDepth: 2,
      replacements: 1,
      arrivals: [{ role: 'healer' }],
    }

    const event = buildDropInExtensionTimelineEvent({
      extraSeconds: 30,
      appliedAt: now,
      hasActiveDeadline: true,
      dropInMeta: meta,
      arrivals: [{}, null, { role: 'tank' }],
      mode: 'realtime',
      turnNumber: 5,
    })

    expect(event).toMatchObject({
      type: 'turn_extended',
      turn: 5,
      timestamp: now,
      reason: 'drop_in_bonus_applied',
      context: {
        mode: 'realtime',
        bonusSeconds: 30,
        arrivalCount: 2,
        queueDepth: 2,
        replacements: 1,
      },
    })
    expect(event.metadata.dropIn).toEqual(meta)
    expect(event.metadata.dropIn).not.toBe(meta)
  })

  it('creates a queued bonus event when no active deadline', () => {
    const event = buildDropInExtensionTimelineEvent({
      extraSeconds: 20,
      appliedAt: 1700000000500,
      hasActiveDeadline: false,
      dropInMeta: { queueDepth: 0 },
      arrivals: [],
      mode: 'async',
      turnNumber: null,
    })

    expect(event).toMatchObject({
      type: 'turn_bonus_pending',
      turn: null,
      reason: 'drop_in_bonus_queued',
      context: {
        mode: 'async',
        bonusSeconds: 20,
      },
    })
  })

  it('returns null when bonus is not positive', () => {
    expect(buildDropInExtensionTimelineEvent({ extraSeconds: 0 })).toBeNull()
    expect(buildDropInExtensionTimelineEvent({ extraSeconds: -5 })).toBeNull()
    expect(buildDropInExtensionTimelineEvent({})).toBeNull()
  })
})
