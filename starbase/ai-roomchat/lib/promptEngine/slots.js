import { safeStr } from './utils'

export function buildSlotsFromParticipants(participants = []) {
  const slots = []
  let i = 0
  for (const participant of participants) {
    const hero = participant.hero || {}
    const row = {
      id: participant.hero_id || null,
      role: participant.role || null,
      status: participant.status || 'alive',
      slot_no:
        participant.slot_no != null && Number.isFinite(Number(participant.slot_no))
          ? Number(participant.slot_no)
          : null,
      name: safeStr(hero.name),
      description: safeStr(hero.description),
      image_url: hero.image_url || null,
    }

    for (let k = 1; k <= 12; k++) {
      row[`ability${k}`] = safeStr(hero[`ability${k}`])
    }

    slots[i] = row
    i += 1
  }

  return slots
}
