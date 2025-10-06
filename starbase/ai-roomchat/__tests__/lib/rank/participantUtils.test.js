import { normalizeHeroIdValue, resolveParticipantHeroId } from '@/lib/rank/participantUtils'

describe('normalizeHeroIdValue', () => {
  it('normalizes numeric ids to strings', () => {
    expect(normalizeHeroIdValue(42)).toBe('42')
  })

  it('returns null for empty strings', () => {
    expect(normalizeHeroIdValue('   ')).toBeNull()
  })
})

describe('resolveParticipantHeroId', () => {
  it('prefers direct hero_id when present', () => {
    expect(
      resolveParticipantHeroId({
        hero_id: 'hero-direct',
        hero_ids: ['hero-fallback'],
      }),
    ).toBe('hero-direct')
  })

  it('falls back to hero_ids array when direct id missing', () => {
    expect(resolveParticipantHeroId({ hero_ids: [null, 'hero-alt'] })).toBe('hero-alt')
  })

  it('falls back to nested hero object id', () => {
    expect(resolveParticipantHeroId({ hero: { id: 123 } })).toBe('123')
  })
})
