function normalizeId(value) {
  if (value == null) return '';
  return String(value).trim();
}

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildJoinedParticipants(scoreboard = [], heroLookup = {}) {
  return (Array.isArray(scoreboard) ? scoreboard : [])
    .map((entry, index) => {
      const heroId = normalizeId(entry?.hero_id ?? entry?.heroId);
      if (!heroId) return null;
      const hero =
        heroLookup && typeof heroLookup === 'object'
          ? heroLookup[heroId] || null
          : null;
      return {
        id: heroId,
        heroId,
        role: normalizeId(entry?.role),
        rating: Number.isFinite(Number(entry?.rating ?? entry?.score))
          ? Number(entry?.rating ?? entry?.score)
          : null,
        slotNo:
          Number.isFinite(Number(entry?.slot_no ?? entry?.slotNo))
            ? Number(entry.slot_no ?? entry.slotNo)
            : index + 1,
        name: hero?.name || hero?.display_name || `캐릭터 ${index + 1}`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.slotNo - right.slotNo);
}

function buildWeightedCandidates(candidates = [], referenceRating = null, scoreRange = 0) {
  return candidates.map((participant, index) => {
    const rating = toNumberOrNull(participant?.rating);
    let weight = 1;

    if (referenceRating != null && rating != null) {
      const gap = Math.abs(referenceRating - rating);
      const window = scoreRange > 0 ? scoreRange : 300;
      const closeness = Math.max(0.15, 1 + Math.max(0, window - gap) / Math.max(1, window));
      weight *= closeness;
    }

    const slotBias = Number.isFinite(Number(participant?.slotNo))
      ? Math.max(0.2, 1 - Math.min(0.35, (Number(participant.slotNo) - 1) * 0.02))
      : 1;
    weight *= slotBias;

    return {
      participant,
      weight: Math.max(0.01, weight),
      index,
    };
  });
}

function pickWeightedParticipant(candidates = [], randomFn = Math.random) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  if (candidates.length === 1) return candidates[0]?.participant || null;

  const total = candidates.reduce((sum, entry) => sum + Math.max(0, Number(entry?.weight) || 0), 0);
  if (!Number.isFinite(total) || total <= 0) {
    return candidates[0]?.participant || null;
  }

  const random = typeof randomFn === 'function' ? randomFn() : Math.random();
  let cursor = Math.max(0, Math.min(0.999999, Number.isFinite(random) ? random : 0)) * total;
  for (const entry of candidates) {
    cursor -= Math.max(0, Number(entry?.weight) || 0);
    if (cursor <= 0) {
      return entry.participant || null;
    }
  }
  return candidates[candidates.length - 1]?.participant || null;
}

function pickParticipantsWithWeights({
  candidates = [],
  limit = 1,
  randomFn = Math.random,
  referenceRating = null,
  scoreRange = 0,
} = {}) {
  const remaining = Array.isArray(candidates) ? [...candidates] : [];
  const picked = [];
  while (remaining.length && picked.length < limit) {
    const weighted = buildWeightedCandidates(remaining, referenceRating, scoreRange);
    const chosen = pickWeightedParticipant(weighted, randomFn);
    if (!chosen) break;
    picked.push(chosen);
    const chosenId = normalizeId(chosen?.heroId || chosen?.id);
    const chosenIndex = remaining.findIndex(candidate => {
      return normalizeId(candidate?.heroId || candidate?.id) === chosenId;
    });
    if (chosenIndex >= 0) {
      remaining.splice(chosenIndex, 1);
    } else {
      break;
    }
  }
  return picked;
}

function selectParticipantsForSession(
  joinedParticipants = [],
  roles = [],
  maxPlayers = 2,
  activeHeroId = '',
  options = {}
) {
  const sorted = Array.isArray(joinedParticipants) ? [...joinedParticipants] : [];
  const selected = [];
  const selectedIds = new Set();
  const activeParticipant = activeHeroId
    ? sorted.find(participant => participant.heroId === activeHeroId) || null
    : null;
  const activeRating = toNumberOrNull(activeParticipant?.rating);
  const randomFn = typeof options?.randomFn === 'function' ? options.randomFn : Math.random;
  const scoreRange = Number.isFinite(Number(options?.scoreRange))
    ? Math.max(0, Number(options.scoreRange))
    : 0;

  const pushParticipant = participant => {
    if (!participant?.heroId || selectedIds.has(participant.heroId)) return false;
    if (selected.length >= maxPlayers) return false;
    selected.push(participant);
    selectedIds.add(participant.heroId);
    return true;
  };

  if (Array.isArray(roles) && roles.length) {
    roles.forEach(role => {
      const name = normalizeId(role?.name || role?.id);
      const limit = Number.isFinite(Number(role?.limit)) ? Math.max(1, Number(role.limit)) : 1;
      if (!name || limit <= 0) return;
      const matching = sorted.filter(participant => participant.role === name);
      if (!matching.length) return;

      const preferred = [];
      if (activeHeroId) {
        const active = matching.find(participant => participant.heroId === activeHeroId);
        if (active) preferred.push(active);
      }
      matching.forEach(participant => {
        if (!preferred.includes(participant)) preferred.push(participant);
      });
      const required = Math.max(0, limit - preferred.filter(participant => participant.heroId === activeHeroId).length);
      preferred
        .filter(participant => participant.heroId === activeHeroId)
        .forEach(pushParticipant);
      pickParticipantsWithWeights({
        candidates: preferred.filter(participant => participant.heroId !== activeHeroId),
        limit: required,
        randomFn,
        referenceRating: activeRating,
        scoreRange,
      }).forEach(pushParticipant);
    });
  }

  if (selected.length < maxPlayers) {
    const preferred = [];
    if (activeHeroId) {
      const active = sorted.find(participant => participant.heroId === activeHeroId);
      if (active) preferred.push(active);
    }
    sorted.forEach(participant => {
      if (!preferred.includes(participant)) preferred.push(participant);
    });
    pickParticipantsWithWeights({
      candidates: preferred.filter(participant => !selectedIds.has(participant.heroId)),
      limit: Math.max(0, maxPlayers - selected.length),
      randomFn,
      referenceRating: activeRating,
      scoreRange,
    }).forEach(pushParticipant);
  }

  return selected
    .slice()
    .sort((left, right) => {
      return (Number(left?.slotNo) || 0) - (Number(right?.slotNo) || 0);
    });
}

export function evaluateBattleReadiness({
  definition = null,
  scoreboard = [],
  heroLookup = {},
  hero = null,
  randomFn = Math.random,
} = {}) {
  const joinedParticipants = buildJoinedParticipants(scoreboard, heroLookup);
  const maxPlayers = Math.max(1, Math.min(12, Number(definition?.maxPlayers) || 2));
  const minPlayers = Math.max(1, Math.min(maxPlayers, Number(definition?.minPlayers) || 1));
  const roles = Array.isArray(definition?.roles) ? definition.roles : [];
  const scoreRange = Number.isFinite(Number(definition?.scoreRange))
    ? Math.max(0, Number(definition.scoreRange))
    : 0;

  const roleCounts = new Map();
  joinedParticipants.forEach(participant => {
    if (!participant.role) return;
    roleCounts.set(participant.role, (roleCounts.get(participant.role) || 0) + 1);
  });

  const roleSummary = roles.map(role => {
    const name = normalizeId(role?.name || role?.id);
    const limit = Number.isFinite(Number(role?.limit)) ? Math.max(1, Number(role.limit)) : 1;
    const occupied = roleCounts.get(name) || 0;
    return {
      name,
      team: normalizeId(role?.team),
      limit,
      occupied,
      missing: Math.max(0, limit - occupied),
      overflow: Math.max(0, occupied - limit),
    };
  });

  const missingRoles = roleSummary.filter(role => role.missing > 0);
  const overflowRoles = roleSummary.filter(role => role.overflow > 0);
  const activeHeroId = normalizeId(hero?.id);
  const selectedParticipants = selectParticipantsForSession(
    joinedParticipants,
    roles,
    maxPlayers,
    activeHeroId,
    { randomFn, scoreRange }
  );
  const heroIds = selectedParticipants
    .map(participant => participant.heroId)
    .filter((value, index, list) => value && list.indexOf(value) === index)
    .slice(0, maxPlayers);
  const joinedCount = joinedParticipants.length;
  const tooManyPlayers = joinedCount > maxPlayers;
  const scoredParticipants = selectedParticipants.filter(participant =>
    Number.isFinite(Number(participant?.rating))
  );
  const ratings = scoredParticipants.map(participant => Number(participant.rating));
  const scoreMin = ratings.length ? Math.min(...ratings) : null;
  const scoreMax = ratings.length ? Math.max(...ratings) : null;
  const scoreGap =
    scoreMin != null && scoreMax != null ? Math.max(0, scoreMax - scoreMin) : null;

  const includesActiveHero = !activeHeroId || heroIds.includes(activeHeroId);
  const enoughPlayers = heroIds.length >= minPlayers;
  const roleReady = !roles.length || missingRoles.length === 0;
  const scoreReady = !scoreRange || scoreGap == null || scoreGap <= scoreRange;

  return {
    ready: enoughPlayers && roleReady && includesActiveHero && scoreReady,
    maxPlayers,
    minPlayers,
    scoreRange,
    scoreGap,
    scoreMin,
    scoreMax,
    heroIds,
    joinedCount,
    joinedParticipants,
    selectedParticipants,
    includesActiveHero,
    enoughPlayers,
    roleReady,
    scoreReady,
    tooManyPlayers,
    roleSummary,
    missingRoles,
    overflowRoles,
  };
}
