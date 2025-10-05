export function deriveParticipantOwnerId(participant) {
  if (!participant) return null
  return (
    participant?.owner_id ??
    participant?.ownerId ??
    participant?.ownerID ??
    participant?.owner?.id ??
    null
  )
}

export function resolveParticipantSlotIndex(participant) {
  if (!participant || typeof participant !== 'object') {
    return null
  }

  const explicitIndex = Number(participant?.slotIndex ?? participant?.slot_index)
  if (Number.isInteger(explicitIndex) && explicitIndex >= 0) {
    return explicitIndex
  }

  const slotNo = Number(
    participant?.slot_no ??
      participant?.slotNo ??
      (participant?.slot_index != null ? participant.slot_index + 1 : null),
  )
  if (Number.isInteger(slotNo) && slotNo > 0) {
    return slotNo - 1
  }

  return null
}

export function findParticipantBySlotIndex(participants, slotIndex) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0) {
    return null
  }

  if (!Array.isArray(participants) || participants.length === 0) {
    return null
  }

  for (const participant of participants) {
    const resolvedIndex = resolveParticipantSlotIndex(participant)
    if (resolvedIndex === slotIndex) {
      return participant
    }
  }

  return participants[slotIndex] ?? null
}

export function formatOwnerDisplayName(participant, fallbackId = '') {
  if (!participant) {
    return fallbackId ? `플레이어 ${fallbackId.slice(0, 6)}` : '플레이어'
  }
  const heroName =
    participant?.hero?.name ??
    participant?.hero_name ??
    participant?.display_name ??
    participant?.name ??
    ''
  if (heroName) {
    return heroName
  }
  const ownerId = deriveParticipantOwnerId(participant)
  if (ownerId) {
    return `플레이어 ${String(ownerId).slice(0, 6)}`
  }
  return '플레이어'
}

export function createOwnerDisplayMap(participants) {
  const map = new Map()
  participants.forEach((participant) => {
    const ownerId = deriveParticipantOwnerId(participant)
    if (!ownerId) return
    const normalized = String(ownerId).trim()
    if (!normalized) return
    if (!map.has(normalized)) {
      map.set(normalized, {
        participant,
        displayName: formatOwnerDisplayName(participant, normalized),
      })
    }
  })
  return map
}
