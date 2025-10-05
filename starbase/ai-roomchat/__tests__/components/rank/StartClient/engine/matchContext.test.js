import { createMatchContext } from '@/components/rank/StartClient/engine/matchContext'

function makeParticipant({ id, ownerId, role, heroId, name }) {
  return {
    id,
    owner_id: ownerId,
    ownerId,
    role,
    hero_id: heroId,
    hero: {
      id: heroId,
      name,
    },
  }
}

describe('matchContext normalization', () => {
  it('hydrates slot numbers from layout when participant rows are missing slot_no', () => {
    const participants = [
      makeParticipant({ id: 'p1', ownerId: 'u1', role: 'attack', heroId: 'h1', name: 'A' }),
      makeParticipant({ id: 'p2', ownerId: 'u2', role: 'defense', heroId: 'h2', name: 'B' }),
      makeParticipant({ id: 'p3', ownerId: 'u3', role: 'defense', heroId: 'h3', name: 'C' }),
    ]

    const assignments = [
      {
        role: 'attack',
        heroIds: ['h1'],
        members: [{ owner_id: 'u1', hero_id: 'h1' }],
        roleSlots: [0],
      },
      {
        role: 'defense',
        heroIds: ['h2', 'h3'],
        members: [
          { owner_id: 'u2', hero_id: 'h2' },
          { owner_id: 'u3', hero_id: 'h3' },
        ],
        roleSlots: [0, 1],
      },
    ]

    const slotLayout = [
      { slot_index: 1, role: 'attack', hero_id: 'h1', hero_owner_id: 'u1' },
      { slot_index: 2, role: 'defense', hero_id: 'h2', hero_owner_id: 'u2' },
      { slot_index: 3, role: 'defense', hero_id: 'h3', hero_owner_id: 'u3' },
    ]

    const context = createMatchContext({
      game: {},
      participants,
      graph: { nodes: [], edges: [] },
      matchingMetadata: { assignments },
      bundleWarnings: [],
      slotLayout,
    })

    expect(context.participants.map((participant) => participant.slot_no)).toEqual([1, 2, 3])
    expect(context.slotLayout).toHaveLength(3)
  })

  it('avoids assigning duplicate slots when metadata references the same hero twice', () => {
    const participants = [
      makeParticipant({ id: 'p1', ownerId: 'u1', role: 'attack', heroId: 'h1', name: 'Alpha' }),
      makeParticipant({ id: 'p2', ownerId: 'u2', role: 'attack', heroId: 'h2', name: 'Beta' }),
    ]

    const assignments = [
      {
        role: 'attack',
        heroIds: ['h1', 'h1'],
        members: [
          { owner_id: 'u1', hero_id: 'h1' },
          { owner_id: 'u2', hero_id: 'h1' },
        ],
        roleSlots: [0, 1],
      },
    ]

    const slotLayout = [
      { slot_index: 1, role: 'attack', hero_id: 'h1', hero_owner_id: 'u1' },
      { slot_index: 2, role: 'attack', hero_id: 'h2', hero_owner_id: 'u2' },
    ]

    const context = createMatchContext({
      game: {},
      participants,
      graph: { nodes: [], edges: [] },
      matchingMetadata: { assignments },
      bundleWarnings: [],
      slotLayout,
    })

    const slotNumbers = context.participants
      .map((participant) => participant.slot_no)
      .filter((value) => value != null)

    expect(new Set(slotNumbers).size).toBe(slotNumbers.length)
    expect(slotNumbers).toEqual([1, 2])
  })
})
