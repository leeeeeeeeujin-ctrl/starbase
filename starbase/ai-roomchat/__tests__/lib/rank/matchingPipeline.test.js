import { buildCandidateSample, extractMatchingToggles } from '@/lib/rank/matchingPipeline'

function createQueueEntry({
  id,
  ownerId,
  role,
  score,
  joinedAt = '2024-01-01T00:00:00Z',
}) {
  return {
    id,
    owner_id: ownerId,
    role,
    score,
    joined_at: joinedAt,
  }
}

function createParticipant({
  ownerId,
  role,
  score,
  heroId,
  updatedAt = '2024-01-01T00:05:00Z',
}) {
  return {
    owner_id: ownerId,
    role,
    score,
    hero_id: heroId,
    updated_at: updatedAt,
  }
}

describe('buildCandidateSample', () => {
  it('returns queue entries unchanged when realtime matching is enabled', () => {
    const queue = [
      createQueueEntry({ id: 'q1', ownerId: 'p1', role: 'attack', score: 1200 }),
      createQueueEntry({ id: 'q2', ownerId: 'p2', role: 'support', score: 1300 }),
    ]
    const participantPool = [
      createParticipant({ ownerId: 'p3', role: 'attack', score: 1180 }),
    ]

    const { sample, meta } = buildCandidateSample({
      queue,
      participantPool,
      realtimeEnabled: true,
      roles: [
        { name: 'attack', slot_count: 1 },
        { name: 'support', slot_count: 1 },
      ],
    })

    expect(sample).toHaveLength(2)
    expect(sample).toEqual(queue)
    expect(meta.realtime).toBe(true)
    expect(meta.sampleType).toBe('realtime_queue')
    expect(meta.queueSampled).toBe(2)
    expect(meta.participantPoolCount).toBe(1)
  })

  it('filters participant pool by score window, role targets, and ownership when offline', () => {
    const queue = [
      createQueueEntry({ id: 'q1', ownerId: 'p1', role: 'attack', score: 1200 }),
      createQueueEntry({ id: 'q2', ownerId: 'p2', role: 'support', score: 1300 }),
    ]

    const participantPool = [
      createParticipant({ ownerId: 'p1', role: 'attack', score: 1180, heroId: 'h-skip' }), // should be skipped (already queued)
      createParticipant({ ownerId: 'p3', role: 'attack', score: 1180, heroId: 'h-attack' }),
      createParticipant({ ownerId: 'p4', role: 'support', score: 1800, heroId: 'h-drop' }), // filtered by score window
      createParticipant({ ownerId: 'p5', role: 'support', score: 1310, heroId: 'h-support' }),
      createParticipant({ ownerId: 'p6', role: 'tank', score: 1250, heroId: 'h-tank' }), // role not targeted
    ]

    const rules = {
      non_realtime_score_window: 120,
      non_realtime_simulated_per_role: 1,
      non_realtime_simulated_total: 2,
    }

    const { sample, meta } = buildCandidateSample({
      queue,
      participantPool,
      realtimeEnabled: false,
      roles: [
        { name: 'attack', slot_count: 1 },
        { name: 'support', slot_count: 1 },
      ],
      rules,
    })

    expect(sample).toHaveLength(4)
    expect(sample.slice(0, 2)).toEqual(queue)

    const standins = sample.slice(2)
    expect(standins).toHaveLength(2)
    expect(new Set(standins.map((row) => row.owner_id))).toEqual(new Set(['p3', 'p5']))

    expect(meta.realtime).toBe(false)
    expect(meta.sampleType).toBe('participant_pool')
    expect(meta.queueSampled).toBe(2)
    expect(meta.simulatedFiltered).toBe(1)
    expect(meta.simulatedEligible).toBe(2)
    expect(meta.simulatedSelected).toBe(2)
    expect(meta.perRoleLimit).toBe(1)
    expect(meta.totalLimit).toBe(2)
    expect(meta.scoreWindow).toBe(120)
    expect(meta.roleAverageScores.attack).toBe(1200)
    expect(meta.roleAverageScores.support).toBe(1300)
  })

  it('falls back to duplicate-owner stand-ins when no unique candidates exist', () => {
    const queue = [
      createQueueEntry({ id: 'q1', ownerId: 'creator', role: 'attack', score: 1200 }),
    ]

    const participantPool = [
      createParticipant({ ownerId: 'creator', role: 'attack', score: 1180, heroId: 'hero-a' }),
      createParticipant({ ownerId: 'creator', role: 'attack', score: 1175, heroId: 'hero-b' }),
    ]

    const { sample, meta } = buildCandidateSample({
      queue,
      participantPool,
      realtimeEnabled: false,
      roles: [{ name: 'attack', slot_count: 2 }],
      rules: {},
    })

    expect(sample).toHaveLength(2)
    expect(sample[0]).toEqual(queue[0])
    const standin = sample[1]
    expect(standin.owner_id).toBe('creator')
    expect(['hero-a', 'hero-b']).toContain(standin.hero_id)

    expect(meta.duplicateEligible).toBe(2)
    expect(meta.duplicateSelected).toBe(1)
  })
})

describe('extractMatchingToggles', () => {
  it('treats string "false" realtime flag as disabled', () => {
    const toggles = extractMatchingToggles({ realtime_match: 'false' })
    expect(toggles.realtimeEnabled).toBe(false)
  })

  it('treats string "true" realtime flag as enabled', () => {
    const toggles = extractMatchingToggles({ realtime_match: 'true' })
    expect(toggles.realtimeEnabled).toBe(true)
  })

  it('parses drop-in rule aliases', () => {
    const toggles = extractMatchingToggles(
      { realtime_match: 0 },
      { drop_in: 'allow', allow_drop_in: 'off', dropIn: 'enabled' },
    )
    expect(toggles.realtimeEnabled).toBe(false)
    expect(toggles.dropInEnabled).toBe(true)
  })
})
