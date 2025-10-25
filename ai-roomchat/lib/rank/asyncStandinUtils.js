const GENERIC_ROLE_KEYS = new Set([
  '',
  '역할 미지정',
  '미지정',
  'unassigned',
  'none',
  'any',
  'generic',
]);

const STANDIN_HERO_NAME = 'AI 자동 대역';

export const DEFAULT_SCORE_TOLERANCE_STEPS = [25, 50, 80, 120, 160, 220, 300, 380];

export function toTrimmed(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function toOptionalUuid(value) {
  const trimmed = toTrimmed(value);
  if (!trimmed) return null;
  return trimmed;
}

export function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

export function createSyntheticStandinOwnerId(slotIndex = 0) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (error) {
      // ignore and fall through to fallback implementation
    }
  }

  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  let iteration = 0;
  return template.replace(/[xy]/g, char => {
    // eslint-disable-next-line no-bitwise
    const random = Math.random() * 16 || (slotIndex + iteration++) % 16;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return Math.floor(value).toString(16);
  });
}

export function createPlaceholderCandidate(seat = {}, slotIndex = 0) {
  const placeholderOwnerId = createSyntheticStandinOwnerId(slotIndex);
  const roleValue = seat?.role;
  const scoreValue = seat?.score;
  const ratingValue = seat?.rating;

  const role = toTrimmed(roleValue) || '역할 미지정';
  const scoreNumeric = toNumber(scoreValue);
  const ratingNumeric = toNumber(ratingValue);

  return {
    ownerId: placeholderOwnerId,
    placeholderOwnerId,
    heroId: null,
    heroName: STANDIN_HERO_NAME,
    role,
    score: scoreNumeric !== null ? scoreNumeric : null,
    rating: ratingNumeric !== null ? ratingNumeric : null,
    battles: null,
    winRate: null,
    status: 'standin',
    updatedAt: new Date().toISOString(),
    scoreGap: null,
    ratingGap: null,
    matchSource: 'async_standin_placeholder',
    placeholder: true,
  };
}

function normalizeRole(role) {
  const trimmed = toTrimmed(role);
  const key = trimmed.toLowerCase();
  if (GENERIC_ROLE_KEYS.has(key)) {
    return null;
  }
  return trimmed || null;
}

function sanitizeExcludeOwnerIds(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  return rawList.map(value => toOptionalUuid(value)).filter(value => typeof value === 'string');
}

export function sanitizeSeatRequests(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  return rawList
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const slotIndex = toNumber(entry.slotIndex ?? entry.slot_index);
      if (slotIndex === null || slotIndex < 0) return null;

      const role = normalizeRole(entry.role);
      const score = toNumber(entry.score);
      const rating = toNumber(entry.rating);
      const excludeOwnerIds = sanitizeExcludeOwnerIds(
        entry.excludeOwnerIds ?? entry.exclude_owner_ids
      );

      return {
        slotIndex,
        role,
        score: score !== null ? Math.floor(score) : null,
        rating: rating !== null ? Math.floor(rating) : null,
        excludeOwnerIds,
      };
    })
    .filter(Boolean);
}

export function parseSeatRequestsInput(value) {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    const requests = sanitizeSeatRequests(parsed);
    if (requests.length) {
      return requests;
    }
  } catch (error) {
    // ignore JSON parse errors and fall back to manual parsing
  }

  const lines = value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const requests = lines
    .map(line => {
      const [slotIndexStr, roleRaw = '', scoreStr = '', ratingStr = ''] = line
        .split(',')
        .map(segment => segment.trim());

      const slotIndex = toNumber(slotIndexStr);
      if (slotIndex === null || slotIndex < 0) return null;

      const role = normalizeRole(roleRaw);
      const score = toNumber(scoreStr);
      const rating = toNumber(ratingStr);

      return {
        slotIndex,
        role,
        score: score !== null ? Math.floor(score) : null,
        rating: rating !== null ? Math.floor(rating) : null,
        excludeOwnerIds: [],
      };
    })
    .filter(Boolean);

  return requests;
}

export function formatCandidate(row) {
  if (!row || typeof row !== 'object') return null;
  const ownerId = toOptionalUuid(row.owner_id ?? row.ownerId);
  const heroId = toOptionalUuid(row.hero_id ?? row.heroId);
  const heroName = toTrimmed(row.hero_name ?? row.heroName);
  const role = toTrimmed(row.role);
  const score = toNumber(row.score);
  const rating = toNumber(row.rating);
  const battles = toNumber(row.battles);
  const winRate = row.win_rate !== undefined && row.win_rate !== null ? Number(row.win_rate) : null;
  const status = toTrimmed(row.status);
  const updatedAt = row.updated_at || null;
  const scoreGap = toNumber(row.score_gap);
  const ratingGap = toNumber(row.rating_gap);

  return {
    ownerId,
    heroId,
    heroName,
    role,
    score: score !== null ? score : null,
    rating: rating !== null ? rating : null,
    battles: battles !== null ? battles : null,
    winRate: winRate !== null && Number.isFinite(winRate) ? winRate : null,
    status: status || 'standin',
    updatedAt,
    scoreGap: scoreGap !== null ? scoreGap : null,
    ratingGap: ratingGap !== null ? ratingGap : null,
    matchSource: 'participant_pool',
  };
}

export function normalizeExcludeOwnerIds(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  return rawList.map(value => toOptionalUuid(value)).filter(value => typeof value === 'string');
}

export function toSeatRequestsPayload(seatRequests) {
  if (!Array.isArray(seatRequests)) return [];
  return seatRequests.map(seat => ({
    slot_index: seat.slotIndex,
    role: seat.role,
    score: seat.score,
    rating: seat.rating,
    exclude_owner_ids: Array.isArray(seat.excludeOwnerIds) ? seat.excludeOwnerIds : [],
  }));
}

export function buildDebugSeatExample() {
  return [
    { slotIndex: 0, role: '탱커', score: 1500, rating: 2000, excludeOwnerIds: [] },
    { slotIndex: 1, role: '딜러', score: 1520, rating: 1980, excludeOwnerIds: [] },
  ];
}

export function isGenericRole(role) {
  if (role === null || role === undefined) return true;
  const normalized = toTrimmed(role).toLowerCase();
  return GENERIC_ROLE_KEYS.has(normalized);
}

export function createEmptySeatRow() {
  return { slotIndex: '', role: '', score: '', rating: '', excludeOwnerIds: '' };
}

export function deriveGapForSeat(candidate, seat = {}) {
  if (!candidate || typeof candidate !== 'object') return null;

  const scoreGap = toNumber(candidate.score_gap ?? candidate.scoreGap);
  const ratingGap = toNumber(candidate.rating_gap ?? candidate.ratingGap);
  const hasScoreReference = seat?.score !== null && seat?.score !== undefined;
  const hasRatingReference = seat?.rating !== null && seat?.rating !== undefined;

  if (hasScoreReference && scoreGap !== null) {
    return Math.abs(scoreGap);
  }

  if (hasRatingReference && ratingGap !== null) {
    return Math.abs(ratingGap);
  }

  if (scoreGap !== null) {
    return Math.abs(scoreGap);
  }

  if (ratingGap !== null) {
    return Math.abs(ratingGap);
  }

  return null;
}

function clampRandom(randomValue) {
  if (!Number.isFinite(randomValue) || randomValue < 0) {
    return 0;
  }
  if (randomValue >= 1) {
    return 0.999999;
  }
  return randomValue;
}

export function pickRandomCandidateForSeat({
  candidates,
  seat,
  excludedOwners,
  toleranceSteps = DEFAULT_SCORE_TOLERANCE_STEPS,
  randomFn = Math.random,
}) {
  const owners = excludedOwners instanceof Set ? excludedOwners : new Set(excludedOwners || []);

  const normalizedCandidates = (Array.isArray(candidates) ? candidates : [])
    .map(row => {
      const ownerId = toOptionalUuid(row?.owner_id ?? row?.ownerId);
      if (!ownerId || owners.has(ownerId)) {
        return null;
      }

      const gap = deriveGapForSeat(row, seat);
      return {
        row,
        ownerId,
        gap,
      };
    })
    .filter(Boolean);

  if (!normalizedCandidates.length) {
    return null;
  }

  const hasScoreReference = seat && seat.score !== null && seat.score !== undefined;
  const hasRatingReference = seat && seat.rating !== null && seat.rating !== undefined;
  const toleranceList = hasScoreReference || hasRatingReference ? toleranceSteps : [];

  for (let index = 0; index < toleranceList.length; index += 1) {
    const tolerance = toleranceList[index];
    const pool = normalizedCandidates.filter(candidate => {
      if (candidate.gap === null || candidate.gap === undefined) return true;
      return candidate.gap <= tolerance;
    });

    if (!pool.length) {
      continue;
    }

    const randomValue = typeof randomFn === 'function' ? randomFn() : Math.random();
    const clamped = clampRandom(randomValue);
    const randomIndex = Math.floor(clamped * pool.length);
    return {
      ...pool[randomIndex],
      tolerance,
      iteration: index,
      poolSize: pool.length,
    };
  }

  const fallbackPool = normalizedCandidates;
  if (!fallbackPool.length) {
    return null;
  }

  const randomValue = typeof randomFn === 'function' ? randomFn() : Math.random();
  const clamped = clampRandom(randomValue);
  const randomIndex = Math.floor(clamped * fallbackPool.length);

  return {
    ...fallbackPool[randomIndex],
    tolerance: null,
    iteration: toleranceList.length,
    poolSize: fallbackPool.length,
  };
}
