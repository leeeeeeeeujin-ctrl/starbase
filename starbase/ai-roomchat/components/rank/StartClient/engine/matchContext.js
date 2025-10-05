import { buildSlotsFromParticipants } from '@/lib/promptEngine/slots'

function normalizeId(value) {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

function adoptParticipant(entry, overrides = {}) {
  const base = entry?.participant || {}
  const hero = base.hero ? { ...base.hero } : {}
  const heroId =
    overrides.heroId ?? entry?.heroId ?? base.hero_id ?? hero.id ?? null
  const ownerId =
    overrides.ownerId ?? entry?.ownerId ?? base.owner_id ?? base.ownerId ?? null
  const role = overrides.role ?? base.role ?? null
  const slotNo =
    overrides.slotNo != null && Number.isFinite(overrides.slotNo)
      ? overrides.slotNo
      : base.slot_no != null && Number.isFinite(base.slot_no)
      ? Number(base.slot_no)
      : null

  return {
    ...base,
    role,
    slot_no: slotNo,
    owner_id: ownerId,
    ownerId,
    hero_id: heroId,
    hero: {
      ...hero,
      id: heroId ?? hero.id ?? null,
    },
  }
}

function buildPlaceholderParticipant({ role, slotNo, heroId, ownerId }) {
  return {
    id: null,
    owner_id: ownerId ?? null,
    ownerId: ownerId ?? null,
    role: role || null,
    status: 'missing',
    slot_no:
      slotNo != null && Number.isFinite(slotNo) ? Number(slotNo) : null,
    hero_id: heroId ?? null,
    hero: {
      id: heroId ?? null,
      name: '미배정 슬롯',
      description: '',
      image_url: '',
      background_url: '',
      bgm_url: '',
      bgm_duration_seconds: null,
      ability1: '',
      ability2: '',
      ability3: '',
      ability4: '',
    },
    isPlaceholder: true,
  }
}

function deriveRoleSummary(matchMetadata, participants) {
  const rolesFromMeta =
    matchMetadata?.roleStatus?.roles || matchMetadata?.roles || null
  if (Array.isArray(rolesFromMeta) && rolesFromMeta.length) {
    return rolesFromMeta
      .map((role) => {
        if (!role) return null
        const name =
          typeof role === 'string'
            ? role
            : role.name || role.role || role.id || null
        const slots =
          Number.isFinite(Number(role.slotCount))
            ? Number(role.slotCount)
            : Number.isFinite(Number(role.slots))
            ? Number(role.slots)
            : null
        if (!name) return null
        return { name, slots }
      })
      .filter(Boolean)
  }

  const counts = new Map()
  participants.forEach((participant) => {
    const roleName = participant?.role || 'unknown'
    const prev = counts.get(roleName) || 0
    counts.set(roleName, prev + 1)
  })
  return Array.from(counts.entries()).map(([name, slots]) => ({ name, slots }))
}

function mergeWarnings(bundleWarnings = [], slotWarnings = []) {
  const combined = []
  bundleWarnings.forEach((warning) => {
    if (!warning) return
    if (typeof warning === 'string') {
      combined.push({ type: 'prompt_meta', message: warning })
      return
    }
    combined.push(warning)
  })
  slotWarnings.forEach((warning) => {
    if (!warning) return
    if (typeof warning === 'string') {
      combined.push({ type: 'generic', message: warning })
      return
    }
    combined.push(warning)
  })
  return combined
}

export function sanitizeMatchMetadata(rawMeta) {
  if (!rawMeta) return null
  try {
    const normalized = {
      source: rawMeta.source || rawMeta.matchSource || 'client_start',
      matchType: rawMeta.matchType || null,
      matchCode: rawMeta.matchCode || null,
      dropInTarget: rawMeta.dropInTarget || null,
      dropInMeta: rawMeta.dropInMeta || null,
      sampleMeta: rawMeta.sampleMeta || null,
      roleStatus: rawMeta.roleStatus || null,
      roles: Array.isArray(rawMeta.roles)
        ? rawMeta.roles.map((role) => ({
            ...role,
          }))
        : [],
      assignments: Array.isArray(rawMeta.assignments)
        ? rawMeta.assignments.map((assignment) => ({
            ...assignment,
          }))
        : [],
      storedAt: rawMeta.storedAt || null,
      mode: rawMeta.mode || null,
      turnTimer:
        rawMeta.turnTimer != null && Number.isFinite(Number(rawMeta.turnTimer))
          ? Number(rawMeta.turnTimer)
          : null,
      scoreWindow:
        rawMeta.scoreWindow != null && Number.isFinite(Number(rawMeta.scoreWindow))
          ? Number(rawMeta.scoreWindow)
          : null,
      heroMap: rawMeta.heroMap || null,
    }
    return normalized
  } catch (error) {
    console.warn('[MatchContext] 매칭 메타데이터 정규화 실패:', error)
    return null
  }
}

function normalizeParticipantPool(participants = []) {
  return participants.map((participant, index) => {
    const heroId =
      participant?.hero_id ?? participant?.heroId ?? participant?.hero?.id ?? null
    const ownerId =
      participant?.owner_id ?? participant?.ownerId ?? participant?.owner?.id ?? null
    const role = participant?.role || null
    const slotNo =
      participant?.slot_no != null && Number.isFinite(Number(participant?.slot_no))
        ? Number(participant.slot_no)
        : null
    return {
      participant,
      index,
      heroId: normalizeId(heroId),
      ownerId: normalizeId(ownerId),
      role,
      slotNo,
    }
  })
}

function normalizeAssignments(assignments = []) {
  if (!Array.isArray(assignments)) return []
  return assignments.map((assignment) => {
    const roleName = typeof assignment?.role === 'string' ? assignment.role : ''
    const slots =
      assignment?.slots != null && Number.isFinite(Number(assignment.slots))
        ? Number(assignment.slots)
        : null
    const roleSlots = Array.isArray(assignment?.roleSlots)
      ? assignment.roleSlots
          .map((slot) => Number(slot))
          .filter((value) => Number.isFinite(value))
      : Array.isArray(assignment?.role_slots)
      ? assignment.role_slots
          .map((slot) => Number(slot))
          .filter((value) => Number.isFinite(value))
      : []
    const heroIds = Array.isArray(assignment?.heroIds)
      ? assignment.heroIds
          .map((id) => (id != null ? String(id).trim() : ''))
          .filter((value) => value.length > 0)
      : []
    const members = Array.isArray(assignment?.members)
      ? assignment.members
          .map((member) => {
            if (!member || typeof member !== 'object') {
              return null
            }
            const heroId =
              member.hero_id ??
              member.heroId ??
              member.heroID ??
              (member.hero && (member.hero.id ?? member.heroId)) ??
              null
            const normalizedHeroId =
              heroId != null && String(heroId).trim().length
                ? String(heroId).trim()
                : null
            const ownerId = member.owner_id ?? member.ownerId ?? member.ownerID ?? null
            const normalizedOwnerId =
              ownerId != null && String(ownerId).trim().length
                ? String(ownerId).trim()
                : null
            const slotCandidate =
              member.slot_no ??
              member.slotNo ??
              member.slot_index ??
              member.slotIndex ??
              null
            const slotNo =
              slotCandidate != null && Number.isFinite(Number(slotCandidate))
                ? Number(slotCandidate)
                : null
            return {
              ...member,
              hero_id: normalizedHeroId ?? null,
              heroId: normalizedHeroId ?? null,
              owner_id: normalizedOwnerId ?? null,
              ownerId: normalizedOwnerId ?? null,
              slot_no: slotNo ?? null,
              slotNo: slotNo ?? null,
            }
          })
          .filter(Boolean)
      : []
    return {
      role: roleName,
      slots,
      roleSlots,
      heroIds,
      members,
      groupKey: assignment?.groupKey || null,
      partyKey: assignment?.partyKey || null,
      anchorScore: assignment?.anchorScore || null,
    }
  })
}

export function normalizeMatchParticipants({
  participants = [],
  assignments = [],
}) {
  const pool = normalizeParticipantPool(participants)
  const normalizedAssignments = normalizeAssignments(assignments)
  const used = new Set()
  const resolvedParticipants = []
  const warnings = []

  const claim = (matcher) => {
    for (const entry of pool) {
      if (used.has(entry.index)) continue
      if (!matcher(entry)) continue
      used.add(entry.index)
      return entry
    }
    return null
  }

  const takeByHero = (heroId) => {
    if (!heroId) return null
    const normalized = normalizeId(heroId)
    if (!normalized) return null
    return claim((entry) => entry.heroId && entry.heroId === normalized)
  }

  const takeByOwner = (ownerId) => {
    if (!ownerId) return null
    const normalized = normalizeId(ownerId)
    if (!normalized) return null
    return claim((entry) => entry.ownerId && entry.ownerId === normalized)
  }

  const takeByRole = (roleName) => {
    if (!roleName) return null
    return claim((entry) => entry.role && entry.role === roleName)
  }

  const takeAny = () => claim(() => true)

  normalizedAssignments.forEach((assignment) => {
    const roleName = assignment.role || null
    const maxCount = Math.max(
      assignment.slots || 0,
      assignment.roleSlots.length,
      assignment.heroIds.length,
      assignment.members.length,
    )
    for (let index = 0; index < maxCount; index += 1) {
      const heroId = normalizeId(
        assignment.heroIds[index] ??
          assignment.members[index]?.hero_id ??
          assignment.members[index]?.heroId ??
          assignment.members[index]?.hero?.id ??
          null,
      )
      const ownerId = normalizeId(
        assignment.members[index]?.owner_id ??
          assignment.members[index]?.ownerId ??
          assignment.members[index]?.owner?.id ??
          null,
      )
      const slotNoRaw =
        assignment.roleSlots[index] ??
        assignment.members[index]?.slot_no ??
        assignment.members[index]?.slotNo ??
        assignment.members[index]?.slot_index ??
        assignment.members[index]?.slotIndex ??
        null
      const slotNo =
        slotNoRaw != null && Number.isFinite(Number(slotNoRaw))
          ? Number(slotNoRaw)
          : null

      let claimed = takeByHero(heroId)
      if (!claimed) claimed = takeByOwner(ownerId)
      if (!claimed) claimed = takeByRole(roleName)
      if (!claimed) claimed = takeAny()

      if (claimed) {
        resolvedParticipants.push(
          adoptParticipant(claimed, {
            role: roleName || claimed.role,
            slotNo,
          }),
        )
      } else {
        warnings.push({
          type: 'slot_mismatch',
          message: '[MatchContext] 매칭된 슬롯을 참가자와 일치시키지 못했습니다.',
          context: { role: roleName, slotNo, heroId, ownerId },
        })
        resolvedParticipants.push(
          buildPlaceholderParticipant({
            role: roleName,
            slotNo,
            heroId,
            ownerId,
          }),
        )
      }
    }
  })

  pool.forEach((entry) => {
    if (used.has(entry.index)) return
    used.add(entry.index)
    resolvedParticipants.push(adoptParticipant(entry))
  })

  const slots = buildSlotsFromParticipants(resolvedParticipants)

  return { participants: resolvedParticipants, slots, warnings }
}

export function createMatchContext({
  game = null,
  participants = [],
  graph = { nodes: [], edges: [] },
  matchingMetadata = null,
  bundleWarnings = [],
}) {
  const sanitized = sanitizeMatchMetadata(matchingMetadata)
  const normalized = normalizeMatchParticipants({
    participants,
    assignments: sanitized?.assignments || [],
  })
  const promptSet = game?.prompt_set_id
    ? {
        id: game.prompt_set_id,
        label:
          game.prompt_set_label ||
          game.prompt_set_name ||
          game.prompt_set_slug ||
          null,
        version: game.prompt_set_version || null,
      }
    : null

  const roles = deriveRoleSummary(sanitized, normalized.participants)
  const warnings = mergeWarnings(bundleWarnings, normalized.warnings)

  return {
    game,
    graph,
    participants: normalized.participants,
    slots: normalized.slots,
    promptSet,
    matching: sanitized,
    roles,
    warnings,
  }
}

export function createEmptyMatchContext() {
  return {
    game: null,
    graph: { nodes: [], edges: [] },
    participants: [],
    slots: [],
    promptSet: null,
    matching: null,
    roles: [],
    warnings: [],
  }
}

