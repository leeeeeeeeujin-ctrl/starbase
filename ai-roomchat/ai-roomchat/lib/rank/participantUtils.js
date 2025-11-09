function normalizeTimestamp(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function normaliseRole(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'object' && value !== null) {
    if (typeof value.role === 'string') return value.role.trim();
    if (typeof value.name === 'string') return value.name.trim();
  }
  return '';
}

function coerceScore(value, fallback = 1000) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return fallback;
}

function coerceSlotIndex(value) {
  if (value == null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.trunc(numeric);
  return rounded >= 0 ? rounded : null;
}

export function normalizeHeroIdValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  if (typeof value === 'object') {
    if (typeof value.id !== 'undefined') {
      return normalizeHeroIdValue(value.id);
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const resolved = normalizeHeroIdValue(item);
        if (resolved) return resolved;
      }
    }
  }
  return null;
}

export function resolveParticipantHeroId(participant) {
  if (!participant) return null;
  const direct =
    normalizeHeroIdValue(participant?.hero_id ?? participant?.heroId ?? null) ||
    normalizeHeroIdValue(participant?.hero?.id);
  if (direct) return direct;

  const candidateLists = [];
  if (Array.isArray(participant?.hero_ids)) {
    candidateLists.push(participant.hero_ids);
  }
  if (Array.isArray(participant?.heroIds)) {
    candidateLists.push(participant.heroIds);
  }

  for (const list of candidateLists) {
    for (const candidate of list) {
      const resolved = normalizeHeroIdValue(candidate);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

function normaliseHeroIdList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => normalizeHeroIdValue(item))
    .filter(item => typeof item === 'string' && item.length > 0);
}

export function normalizeParticipantRecord(row) {
  if (!row || typeof row !== 'object') return null;

  const ownerId = row.owner_id || row.ownerId || null;
  if (!ownerId) return null;

  const heroId = resolveParticipantHeroId(row);
  const heroIds = normaliseHeroIdList(row.hero_ids || row.heroIds || []);
  const role = normaliseRole(row.role || row.role_name || row.roleName);
  const score = coerceScore(row.score, coerceScore(row.rating, 1000));
  const slotIndex =
    coerceSlotIndex(row.slot_index ?? row.slotIndex ?? row.slot_no ?? row.slotNo) ?? null;
  const updatedAt = normalizeTimestamp(row.updated_at ?? row.updatedAt);
  const createdAt = normalizeTimestamp(row.created_at ?? row.createdAt);
  const status = typeof row.status === 'string' ? row.status.trim().toLowerCase() : '';

  return {
    ownerId: String(ownerId),
    heroId,
    heroIds,
    role,
    score,
    slotIndex,
    updatedAt: updatedAt || createdAt,
    createdAt,
    status,
    raw: row,
  };
}

export function buildOwnerParticipantIndex(rows = []) {
  const roster = new Map();
  rows.forEach(row => {
    const normalized = normalizeParticipantRecord(row);
    if (!normalized) return;
    const ownerList = roster.get(normalized.ownerId) || [];
    ownerList.push(normalized);
    roster.set(normalized.ownerId, ownerList);
  });

  roster.forEach((list, ownerId) => {
    list.sort((a, b) => {
      if (a.updatedAt === b.updatedAt) {
        return (
          (b.slotIndex ?? Number.POSITIVE_INFINITY) - (a.slotIndex ?? Number.POSITIVE_INFINITY)
        );
      }
      return b.updatedAt - a.updatedAt;
    });
    roster.set(ownerId, list);
  });

  return roster;
}

function pickFallbackHeroId(entry, fallbackHeroId = null) {
  if (entry?.heroId) return entry.heroId;
  if (Array.isArray(entry?.heroIds)) {
    const fallback = entry.heroIds.find(candidate => candidate && candidate.length > 0);
    if (fallback) return fallback;
  }
  return normalizeHeroIdValue(fallbackHeroId);
}

export function guessOwnerParticipant({
  ownerId,
  roster,
  participants = [],
  rolePreference = '',
  fallbackHeroId = null,
  fallbackScore = 1000,
} = {}) {
  if (!ownerId) {
    return {
      ownerId: '',
      heroId: normalizeHeroIdValue(fallbackHeroId),
      role: rolePreference || '',
      score: fallbackScore,
      slotIndex: null,
      source: 'fallback',
      participant: null,
    };
  }

  let entries = [];
  if (roster instanceof Map) {
    entries = roster.get(String(ownerId)) || [];
  } else if (Array.isArray(participants)) {
    entries = participants.map(row => normalizeParticipantRecord(row)).filter(Boolean);
  }

  const preferredRole = normaliseRole(rolePreference);
  let candidate = null;

  if (preferredRole) {
    candidate = entries.find(entry => entry.role === preferredRole && pickFallbackHeroId(entry));
  }

  if (!candidate) {
    candidate = entries.find(entry => pickFallbackHeroId(entry)) || entries[0] || null;
  }

  const heroId = pickFallbackHeroId(candidate, fallbackHeroId);
  const role = candidate?.role || preferredRole || '';
  const score = Number.isFinite(candidate?.score) ? candidate.score : fallbackScore;
  const slotIndex = candidate?.slotIndex ?? null;
  const source = candidate ? 'participant' : heroId ? 'explicit' : 'fallback';

  return {
    ownerId: String(ownerId),
    heroId: heroId || null,
    role,
    score,
    slotIndex,
    source,
    participant: candidate,
  };
}
