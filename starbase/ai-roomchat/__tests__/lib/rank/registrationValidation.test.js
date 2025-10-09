import { prepareRegistrationPayload } from '../../../lib/rank/registrationValidation.js'

describe('prepareRegistrationPayload', () => {
  const basePayload = {
    name: '테스트 게임',
    description: '설명',
    image_url: 'https://example.com/cover.png',
    prompt_set_id: 'set-1',
    realtime_match: 'OFF',
    roles: [
      { name: '공격', score_delta_min: 10, score_delta_max: 20 },
      { name: '수비', score_delta_min: 15, score_delta_max: 25 },
    ],
    rules: {
      nerf_insight: true,
      brawl_rule: 'banish-on-loss',
      char_limit: 200,
    },
  }

  it('requires at least one active slot with a role', () => {
    const result = prepareRegistrationPayload({ ...basePayload, slots: [] })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch('슬롯을 활성화')
  })

  it('derives role slot counts from the provided slots', () => {
    const result = prepareRegistrationPayload({
      ...basePayload,
      slots: [
        { slot_index: 1, role: '공격', active: true },
        { slot_index: 2, role: '수비', active: true },
        { slot_index: 3, role: '수비', active: true },
        { slot_index: 4, role: '수비', active: false },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.slots).toHaveLength(4)
    const attack = result.roles.find((role) => role.name === '공격')
    const defence = result.roles.find((role) => role.name === '수비')
    expect(attack.slot_count).toBe(1)
    expect(defence.slot_count).toBe(2)
  })

  it('accepts slot_map alias and trims role names', () => {
    const result = prepareRegistrationPayload({
      ...basePayload,
      slot_map: [
        { slot_index: 1, role: '  공격  ', active: true },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.slots[0]).toMatchObject({ role: '공격', active: true })
    const attack = result.roles.find((role) => role.name === '공격')
    expect(attack.slot_count).toBe(1)
  })
})
