const MATCH_DEBUG_HOLD_ENABLED =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MATCH_DEBUG_HOLD !== 'false'

// TODO: NEXT_PUBLIC_MATCH_DEBUG_HOLD 기본값을 출시 전에 'false'로 되돌리기

function coerceUuid(value) {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  return trimmed
}

function summarizeMembers(members) {
  if (!Array.isArray(members)) return []
  return members
    .map((member, index) => {
      if (!member || typeof member !== 'object') {
        return {
          index,
          ownerId: null,
          heroId: null,
          ready: false,
          standin: false,
          status: null,
          heroName: null,
        }
      }
      const ownerId = coerceUuid(member.owner_id ?? member.ownerId)
      const heroId = coerceUuid(member.hero_id ?? member.heroId)
      return {
        index,
        ownerId,
        heroId,
        ready: Boolean(member.ready),
        standin: Boolean(member.standin),
        status: member.status || null,
        heroName: member.hero_name || member.heroName || member.name || null,
      }
    })
}

export function summarizeAssignments(assignments) {
  if (!Array.isArray(assignments)) return []
  return assignments.map((assignment, index) => {
    const role =
      typeof assignment?.role === 'string' && assignment.role.trim()
        ? assignment.role.trim()
        : `슬롯 ${index + 1}`
    const slotIndex =
      Number.isInteger(assignment?.slotIndex)
        ? assignment.slotIndex
        : Number.isInteger(assignment?.slot_index)
        ? assignment.slot_index
        : index
    return {
      role,
      slotIndex,
      members: summarizeMembers(assignment?.members),
    }
  })
}

export function summarizeParticipants(participants) {
  if (!Array.isArray(participants)) return []
  return participants
    .map((participant, index) => {
      if (!participant || typeof participant !== 'object') {
        return null
      }
      return {
        index,
        name: participant.name || participant.heroName || '참가자',
        role: participant.role || null,
        ownerId: coerceUuid(participant.owner_id ?? participant.ownerId),
        heroId: coerceUuid(participant.hero_id ?? participant.heroId),
        standin: Boolean(participant.standin),
      }
    })
    .filter(Boolean)
}

export function detectAssignmentAnomalies(assignments) {
  const duplicateOwners = []
  const duplicateHeroes = []
  const ownerMap = new Map()
  const heroMap = new Map()

  assignments.forEach((assignment, assignmentIndex) => {
    assignment.members.forEach((member) => {
      if (member.ownerId) {
        const key = member.ownerId
        const history = ownerMap.get(key)
        if (history) {
          duplicateOwners.push({
            ownerId: key,
            previous: history,
            current: { role: assignment.role, slotIndex: assignment.slotIndex, index: member.index },
          })
        } else {
          ownerMap.set(key, { role: assignment.role, slotIndex: assignment.slotIndex, index: member.index })
        }
      }
      if (member.heroId) {
        const key = member.heroId
        const history = heroMap.get(key)
        if (history) {
          duplicateHeroes.push({
            heroId: key,
            previous: history,
            current: { role: assignment.role, slotIndex: assignment.slotIndex, index: member.index },
          })
        } else {
          heroMap.set(key, { role: assignment.role, slotIndex: assignment.slotIndex, index: member.index })
        }
      }
    })
  })

  const emptySlots = assignments
    .filter((assignment) => assignment.members.length === 0)
    .map((assignment) => ({ role: assignment.role, slotIndex: assignment.slotIndex }))

  return { duplicateOwners, duplicateHeroes, emptySlots }
}

function buildIssueList(anomalies) {
  const issues = []
  if (anomalies.duplicateOwners.length) {
    anomalies.duplicateOwners.forEach((entry) => {
      issues.push(
        `참가자 ${entry.ownerId}가 ${entry.previous.role}과 ${entry.current.role}에 중복 배정되었습니다.`,
      )
    })
  }
  if (anomalies.duplicateHeroes.length) {
    anomalies.duplicateHeroes.forEach((entry) => {
      issues.push(
        `히어로 ${entry.heroId}가 ${entry.previous.role}과 ${entry.current.role}에 중복 배정되었습니다.`,
      )
    })
  }
  if (anomalies.emptySlots.length) {
    anomalies.emptySlots.forEach((slot) => {
      issues.push(`역할 ${slot.role}에 배정된 인원이 없습니다.`)
    })
  }
  return issues
}

export function buildDebugHoldSnapshot({
  queueMode = null,
  sessionId = null,
  matchCode = null,
  assignments = [],
  participants = [],
  reconciled = null,
  inserted = null,
  removed = null,
  note = '자동 시작이 일시 중단되었습니다. 전투 화면을 수동으로 열어 주세요.',
}) {
  const normalizedAssignments = summarizeAssignments(assignments)
  const normalizedParticipants = summarizeParticipants(participants)
  const anomalies = detectAssignmentAnomalies(normalizedAssignments)
  const issues = buildIssueList(anomalies)

  return {
    active: true,
    note,
    queueMode,
    sessionId,
    matchCode,
    reconciled,
    inserted,
    removed,
    assignments: normalizedAssignments,
    participants: normalizedParticipants,
    anomalies,
    issues,
    generatedAt: new Date().toISOString(),
  }
}

export { MATCH_DEBUG_HOLD_ENABLED }
