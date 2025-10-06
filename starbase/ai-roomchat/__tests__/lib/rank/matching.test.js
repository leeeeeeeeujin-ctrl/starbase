import { matchRankParticipants } from '@/lib/rank/matching'

function buildQueueEntry({ id, ownerId, heroId, role, score }) {
  return {
    id,
    owner_id: ownerId,
    hero_id: heroId,
    role,
    score,
    entry: {
      id,
      owner_id: ownerId,
      hero_id: heroId,
    },
  }
}

describe('matchRankParticipants', () => {
  const roles = [
    { name: 'attack', slot_count: 1 },
    { name: 'support', slot_count: 1 },
  ]

  it('marks a room ready when a single-slot role fills its lone seat', () => {
    const singleRole = [{ name: 'solo', slot_count: 1 }]
    const queue = [
      buildQueueEntry({
        id: 'q-solo',
        ownerId: 'owner-solo',
        heroId: 'hero-solo',
        role: 'solo',
        score: 1120,
      }),
    ]

    const result = matchRankParticipants({ roles: singleRole, queue })

    expect(result.ready).toBe(true)
    expect(result.totalSlots).toBe(1)
    expect(result.assignments).toHaveLength(1)
    const [assignment] = result.assignments
    expect(assignment.ready).toBe(true)
    expect(assignment.roleSlots).toEqual([
      expect.objectContaining({ role: 'solo', occupied: true, slotIndex: 0 }),
    ])
    expect(result.rooms[0].missingSlots).toBe(0)
  })

  it('combines groups from different roles when score gaps stay within the window', () => {
    const queue = [
      buildQueueEntry({ id: 'q1', ownerId: 'owner-a', heroId: 'hero-a', role: 'attack', score: 1200 }),
      buildQueueEntry({ id: 'q2', ownerId: 'owner-b', heroId: 'hero-b', role: 'support', score: 1250 }),
    ]

    const result = matchRankParticipants({ roles, queue, scoreWindows: [200] })

    expect(result.ready).toBe(true)
    expect(result.assignments).toHaveLength(1)
    const [assignment] = result.assignments
    expect(assignment.ready).toBe(true)
    const attackSlot = assignment.roleSlots.find((slot) => slot.role === 'attack')
    const supportSlot = assignment.roleSlots.find((slot) => slot.role === 'support')
    expect(attackSlot?.occupied).toBe(true)
    expect(supportSlot?.occupied).toBe(true)
  })

  it('splits rooms when cross-role score gaps exceed the allowed window', () => {
    const queue = [
      buildQueueEntry({ id: 'q1', ownerId: 'owner-a', heroId: 'hero-a', role: 'attack', score: 1000 }),
      buildQueueEntry({ id: 'q2', ownerId: 'owner-b', heroId: 'hero-b', role: 'support', score: 1500 }),
    ]

    const result = matchRankParticipants({ roles, queue, scoreWindows: [200] })

    expect(result.ready).toBe(false)
    expect(result.assignments).toHaveLength(2)
    result.assignments.forEach((assignment) => {
      expect(assignment.ready).toBe(false)
      const filled = assignment.roleSlots.filter((slot) => slot.occupied)
      expect(filled).toHaveLength(1)
    })

    const combinedSlots = result.assignments.flatMap((assignment) => assignment.roleSlots)
    const attackSlots = combinedSlots.filter((slot) => slot.role === 'attack')
    const supportSlots = combinedSlots.filter((slot) => slot.role === 'support')
    expect(attackSlots.some((slot) => slot.occupied)).toBe(true)
    expect(attackSlots.some((slot) => !slot.occupied)).toBe(true)
    expect(supportSlots.some((slot) => slot.occupied)).toBe(true)
    expect(supportSlots.some((slot) => !slot.occupied)).toBe(true)
  })
})

