import { compileTemplate } from '@/lib/promptEngine/template'

describe('promptEngine template', () => {
  it('supports zero-based slot placeholders', () => {
    const slots = [
      { name: 'Hero Zero', role: 'attack', slot_no: 0 },
      { name: 'Hero One', role: 'defense', slot_no: 1 },
    ]

    const { text } = compileTemplate({
      template: '{{slot0.name}} vs {{slot1.name}} ({{slot1.role}})',
      slots,
    })

    expect(text).toBe('Hero Zero vs Hero One (defense)')
  })

  it('clears missing slot placeholders for zero-based values', () => {
    const slots = [{ name: 'Solo', slot_no: 0 }]

    const { text } = compileTemplate({
      template: '{{slot0.name}} {{slot1.name}}',
      slots,
    })

    expect(text).toBe('Solo ')
  })
})
