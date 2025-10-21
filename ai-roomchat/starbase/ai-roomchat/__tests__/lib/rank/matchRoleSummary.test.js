import { buildRoleSummaryBuckets, computeRoleReadiness } from '@/lib/rank/matchRoleSummary'

describe('matchRoleSummary helpers', () => {
  it('summarises slot layout occupancy and detects readiness', () => {
    const buckets = buildRoleSummaryBuckets({
      roles: [
        { name: '공격', slot_count: 2 },
        { name: '수비', slot_count: 1 },
      ],
      slotLayout: [
        { slotIndex: 0, role: '공격' },
        { slotIndex: 1, role: '공격' },
        { slotIndex: 2, role: '수비' },
      ],
      assignments: [
        {
          role: '공격',
          roleSlots: [
            { role: '공격', members: [{ hero_id: 'A1' }] },
            { role: '공격', members: [{ hero_id: 'A2' }] },
          ],
        },
        {
          role: '수비',
          roleSlots: [{ role: '수비', members: [{ hero_id: 'B1' }] }],
        },
      ],
    })

    expect(buckets).toEqual([
      { role: '공격', total: 2, filled: 2, missing: 0, ready: true },
      { role: '수비', total: 1, filled: 1, missing: 0, ready: true },
    ])

    const readiness = computeRoleReadiness({
      roles: [{ name: '공격', slot_count: 2 }, { name: '수비', slot_count: 1 }],
      slotLayout: [
        { slotIndex: 0, role: '공격' },
        { slotIndex: 1, role: '공격' },
        { slotIndex: 2, role: '수비' },
      ],
      assignments: [
        {
          role: '공격',
          roleSlots: [
            { role: '공격', members: [{ hero_id: 'A1' }] },
            { role: '공격', members: [{ hero_id: 'A2' }] },
          ],
        },
        {
          role: '수비',
          roleSlots: [{ role: '수비', members: [{ hero_id: 'B1' }] }],
        },
      ],
    })

    expect(readiness.ready).toBe(true)
    expect(readiness.buckets).toEqual(buckets)
  })

  it('falls back to role counts when layout is unavailable', () => {
    const buckets = buildRoleSummaryBuckets({
      roles: [
        { name: '역할1', slot_count: 2 },
        { name: '역할2', slot_count: 1 },
      ],
      assignments: [
        { role: '역할1', members: [{ hero_id: 'A' }, { hero_id: 'B' }] },
        { role: '역할2', members: [{ hero_id: 'C' }] },
      ],
    })

    expect(buckets).toEqual([
      { role: '역할1', total: 2, filled: 2, missing: 0, ready: true },
      { role: '역할2', total: 1, filled: 1, missing: 0, ready: true },
    ])
  })
})
