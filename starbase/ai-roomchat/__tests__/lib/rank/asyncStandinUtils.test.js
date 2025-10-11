import {
  buildDebugSeatExample,
  createPlaceholderCandidate,
  parseSeatRequestsInput,
  sanitizeSeatRequests,
  toSeatRequestsPayload,
} from '@/lib/rank/asyncStandinUtils'

describe('asyncStandinUtils', () => {
  test('sanitizeSeatRequests filters invalid entries', () => {
    const requests = sanitizeSeatRequests([
      { slotIndex: 0, role: '탱커', score: 1500, rating: 2100 },
      { slotIndex: -1, role: '딜러', score: 'bad', rating: 'bad' },
      null,
    ])
    expect(requests).toEqual([
      { slotIndex: 0, role: '탱커', score: 1500, rating: 2100, excludeOwnerIds: [] },
    ])
  })

  test('parseSeatRequestsInput handles csv style input', () => {
    const value = `0, 탱커, 1500, 2000\n1, , , \n2, 미지정, 1400, 1900`
    const parsed = parseSeatRequestsInput(value)
    expect(parsed).toEqual([
      { slotIndex: 0, role: '탱커', score: 1500, rating: 2000, excludeOwnerIds: [] },
      { slotIndex: 1, role: null, score: null, rating: null, excludeOwnerIds: [] },
      { slotIndex: 2, role: null, score: 1400, rating: 1900, excludeOwnerIds: [] },
    ])
  })

  test('parseSeatRequestsInput handles json input', () => {
    const json = JSON.stringify([
      { slotIndex: 0, role: '탱커', score: 1500, rating: 2100 },
      { slotIndex: 1, role: '미지정', score: 1400, rating: 1800 },
    ])
    const parsed = parseSeatRequestsInput(json)
    expect(parsed).toEqual([
      { slotIndex: 0, role: '탱커', score: 1500, rating: 2100, excludeOwnerIds: [] },
      { slotIndex: 1, role: null, score: 1400, rating: 1800, excludeOwnerIds: [] },
    ])
  })

  test('toSeatRequestsPayload converts to API shape', () => {
    const payload = toSeatRequestsPayload([
      { slotIndex: 0, role: '탱커', score: 1500, rating: 2100, excludeOwnerIds: ['a'] },
    ])
    expect(payload).toEqual([
      { slot_index: 0, role: '탱커', score: 1500, rating: 2100, exclude_owner_ids: ['a'] },
    ])
  })

  test('buildDebugSeatExample returns default seats', () => {
    const example = buildDebugSeatExample()
    expect(example.length).toBeGreaterThan(0)
    example.forEach((seat) => {
      expect(typeof seat.slotIndex).toBe('number')
    })
  })

  test('createPlaceholderCandidate returns normalized stand-in details', () => {
    const candidate = createPlaceholderCandidate({ role: '딜러', score: '1520', rating: 2100 }, 2)

    expect(candidate.placeholder).toBe(true)
    expect(candidate.role).toBe('딜러')
    expect(candidate.score).toBe(1520)
    expect(candidate.rating).toBe(2100)
    expect(candidate.heroName).toBe('AI 자동 대역')
    expect(typeof candidate.ownerId).toBe('string')
    expect(candidate.ownerId).toHaveLength(36)
    expect(candidate.matchSource).toBe('async_standin_placeholder')
  })
})
