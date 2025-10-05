import { safeStr } from './utils'

export function buildSlotsFromParticipants(participants = []) {
  const slots = []
  const overflow = []

  for (const participant of participants) {
    if (!participant) continue

    const hero = participant.hero || {}
    const slotNoCandidate =
      participant.slot_no != null && Number.isFinite(Number(participant.slot_no))
        ? Number(participant.slot_no)
        : null

    const row = {
      id: participant.hero_id || null,
      role: participant.role || null,
      status: participant.status || 'alive',
      slot_no: slotNoCandidate,
      name: safeStr(hero.name),
      description: safeStr(hero.description),
      image_url: hero.image_url || null,
    }

    for (let k = 1; k <= 12; k += 1) {
      row[`ability${k}`] = safeStr(hero[`ability${k}`])
    }

    if (slotNoCandidate != null && slotNoCandidate >= 0) {
      const index = slotNoCandidate
      if (slots[index] === undefined) {
        slots[index] = row
        continue
      }
    }

    overflow.push(row)
  }

  if (overflow.length) {
    slots.push(...overflow)
  }

  return slots
}
