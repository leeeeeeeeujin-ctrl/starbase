import { compileTemplate } from '@/lib/rank/prompt'

describe('rank prompt compileTemplate', () => {
  const buildHero = (name, slotNo) => ({
    name,
    description: `${name} description`,
    ability1: `${name} ability`,
    hero_id: `${name.toLowerCase()}-id`,
    heroId: `${name.toLowerCase()}-id`,
    role: slotNo % 2 === 0 ? 'attack' : 'defense',
    slotNo,
    slot_no: slotNo,
    slotNumber: slotNo + 1,
    slot_number: slotNo + 1,
    slotIndex: slotNo,
    slot_index: slotNo,
  })

  it('supports zero-based slot placeholders', () => {
    const slotsMap = {
      0: buildHero('Alpha', 0),
      1: buildHero('Beta', 1),
    }

    const { text } = compileTemplate({
        template: '{{slot0.name}} vs {{slot2.name}}',
      slotsMap,
    })

    expect(text).toBe('Alpha vs Beta')
  })

  it('fills slot metadata for zero-based placeholders', () => {
    const slotsMap = {
      0: buildHero('Gamma', 0),
    }

    const { text } = compileTemplate({
      template:
          '{{slot0.slotNo}}/{{slot0.slotNumber}}/{{slot0.slotIndex}}/{{slot0.role}}',
      slotsMap,
    })

    expect(text).toBe('0/1/0/attack')
  })

  it('produces zero-based random slot index', () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5)
    const { text } = compileTemplate({
      template: '{{slot.random}}',
      slotsMap: {},
    })
    expect(text).toBe('6')
    randomSpy.mockRestore()
  })
})
