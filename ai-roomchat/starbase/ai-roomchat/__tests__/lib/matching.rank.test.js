import { matchRankParticipants } from '@/lib/rank/matching'

function mkEntry({ id, owner, hero, role, score = 1000, joinedAt }) {
  const ts = joinedAt || new Date().toISOString()
  return {
    id: `q${id}`,
    owner_id: String(owner),
    hero_id: String(hero),
    role,
    score,
    joined_at: ts,
  }
}

describe('matchRankParticipants - multi-slot roles & constraints', () => {
  const roles = [
    { name: '공격', slotCount: 1 },
    { name: '수비', slotCount: 2 },
  ]

  test('fills 1 offense + 2 defense with solos within window', () => {
    const queue = [
      mkEntry({ id: 1, owner: 1, hero: 101, role: '공격', score: 1200 }),
      mkEntry({ id: 2, owner: 2, hero: 201, role: '수비', score: 1180 }),
      mkEntry({ id: 3, owner: 3, hero: 301, role: '수비', score: 1210 }),
    ]

    const result = matchRankParticipants({ roles, queue })
    expect(result.ready).toBe(true)
    expect(result.totalSlots).toBe(3)
    const totalAssigned = result.assignments.reduce((a, asn) => a + (asn.members?.length || 0), 0)
    expect(totalAssigned).toBe(3)

    const roleMap = new Map(result.assignments.map((a) => [a.role, a]))
    expect(roleMap.get('공격')?.members?.length).toBe(1)
    expect(roleMap.get('수비')?.members?.length).toBe(2)
  })

  test('defense party of size 2 fills both defense slots', () => {
    const joined = new Date().toISOString()
    const queue = [
      // Defense duo party (same partyKey simulated by same owner and increasing ids is fine – grouping happens per role + partyKey in matching.js buildQueueGroups)
      { ...mkEntry({ id: 10, owner: 10, hero: 210, role: '수비', score: 1100, joinedAt: joined }), partyKey: 'p1' },
      { ...mkEntry({ id: 11, owner: 11, hero: 211, role: '수비', score: 1100, joinedAt: joined }), partyKey: 'p1' },
      mkEntry({ id: 12, owner: 12, hero: 112, role: '공격', score: 1110, joinedAt: joined }),
    ]

    const result = matchRankParticipants({ roles, queue })
    expect(result.ready).toBe(true)
    const roleMap = new Map(result.assignments.map((a) => [a.role, a]))
    expect(roleMap.get('수비')?.members?.length).toBe(2)
    expect(roleMap.get('공격')?.members?.length).toBe(1)
  })

  test('score window prevents mismatch; not ready with far defense', () => {
    const queue = [
      mkEntry({ id: 1, owner: 1, hero: 101, role: '공격', score: 1200 }),
      mkEntry({ id: 2, owner: 2, hero: 201, role: '수비', score: 800 }), // far below default window 200
      mkEntry({ id: 3, owner: 3, hero: 301, role: '수비', score: 2200 }), // far above
    ]

    const result = matchRankParticipants({ roles, queue })
    expect(result.ready).toBe(false)
    expect(result.error?.type).toBeDefined()
  })

  test('duplicate hero id across entries is not allowed in same room', () => {
    const queue = [
      mkEntry({ id: 1, owner: 1, hero: 999, role: '공격', score: 1200 }),
      mkEntry({ id: 2, owner: 2, hero: 999, role: '수비', score: 1200 }), // same hero as offense
      mkEntry({ id: 3, owner: 3, hero: 303, role: '수비', score: 1200 }),
      mkEntry({ id: 4, owner: 4, hero: 404, role: '수비', score: 1200 }),
    ]

    const result = matchRankParticipants({ roles, queue })
    // We cannot fill both defense if the only defense near window conflicts with offense hero
    expect(result.ready).toBe(false)
  })

  test('unsupported role entries are skipped', () => {
    const queue = [
      mkEntry({ id: 1, owner: 1, hero: 101, role: '공격', score: 1000 }),
      mkEntry({ id: 2, owner: 2, hero: 202, role: '힐러', score: 1000 }), // unknown role
      mkEntry({ id: 3, owner: 3, hero: 303, role: '수비', score: 1000 }),
    ]

    const result = matchRankParticipants({ roles, queue })
    expect(result.totalSlots).toBe(3)
    // Can still fail readiness due to missing one defense, but must not crash
    expect(result.error).toBeDefined()
  })
})
