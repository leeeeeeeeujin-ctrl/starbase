import { buildRoleSummaries } from '../../../components/rank/queueSummaryUtils'

describe('buildRoleSummaries', () => {
  it('derives role summaries from slot layout and assignments', () => {
    const summaries = buildRoleSummaries({
      match: {
        slotLayout: [
          { slotIndex: 0, role: '공격' },
          { slotIndex: 1, role: '수비' },
        ],
        assignments: [
          {
            roleSlots: [
              { role: '공격', slotIndex: 0, members: [{ id: 'a' }] },
              { role: '수비', slotIndex: 1, members: [] },
            ],
          },
        ],
        roles: [{ name: '공격 · 수비', slot_count: 2 }],
      },
    })

    expect(summaries).toEqual([
      { role: '공격', filled: 1, total: 1, missing: 0, ready: true },
      { role: '수비', filled: 0, total: 1, missing: 1, ready: false },
    ])
  })

  it('falls back to roles when slot layout is unavailable', () => {
    const summaries = buildRoleSummaries({
      match: {
        assignments: [],
        roles: [
          { name: '지원', slot_count: 2 },
          { name: '공격', slot_count: 1 },
        ],
      },
    })

    expect(summaries).toEqual([
      { role: '지원', filled: 0, total: 2, missing: 2, ready: false },
      { role: '공격', filled: 0, total: 1, missing: 1, ready: false },
    ])
  })

  it('increments totals from assignments when layout is missing', () => {
    const summaries = buildRoleSummaries({
      match: {
        assignments: [
          {
            roleSlots: [
              { role: '방어', members: [{ id: 'b' }] },
              { role: '방어', members: [] },
            ],
          },
        ],
      },
    })

    expect(summaries).toEqual([
      { role: '방어', filled: 1, total: 2, missing: 1, ready: false },
    ])
  })
})
