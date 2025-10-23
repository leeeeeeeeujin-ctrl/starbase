const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toUuid(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return UUID_PATTERN.test(text) ? text : null;
}

function toSlotIndex(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const integer = Math.trunc(numeric);
  return integer >= 0 ? integer : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (!lowered) return fallback;
    if (['true', '1', 'yes', 'y', 'on'].includes(lowered)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(lowered)) return false;
  }
  return fallback;
}

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toTrimmed(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function toIsoTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toPlainObject(value) {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value)) return {};
  return value;
}

function normalizeEntry(raw, index) {
  if (!raw || typeof raw !== 'object') return null;

  const slotIndex = toSlotIndex(
    raw.slotIndex ?? raw.slot_index ?? raw.slotNo ?? raw.slot_no,
    index
  );
  if (!Number.isInteger(slotIndex) || slotIndex < 0) {
    return null;
  }

  const slotId = toUuid(raw.slotId ?? raw.slot_id ?? raw.id);
  const ownerId = toUuid(raw.ownerId ?? raw.owner_id ?? raw.occupantOwnerId ?? raw.ownerID);
  const placeholderOwnerId = toUuid(
    raw.placeholderOwnerId ?? raw.placeholder_owner_id ?? raw.fallbackOwnerId
  );
  const heroId = toUuid(raw.heroId ?? raw.hero_id ?? raw.occupantHeroId ?? raw.heroID);
  const heroName = toTrimmed(raw.heroName ?? raw.hero_name ?? raw.displayName);
  const heroSummary = toPlainObject(raw.heroSummary ?? raw.hero_summary ?? raw.heroMeta ?? {});
  const ready = toBoolean(raw.ready ?? raw.isReady ?? raw.occupantReady, false);
  const joinedAt = toIsoTimestamp(raw.joinedAt ?? raw.joined_at);
  const standin = toBoolean(raw.standin ?? raw.isStandin, false);
  const standinPlaceholder = toBoolean(
    raw.standinPlaceholder ?? raw.standin_placeholder ?? raw.placeholder,
    false
  );
  const matchSource =
    toTrimmed(raw.matchSource ?? raw.match_source) ||
    (standinPlaceholder ? 'async_standin_placeholder' : null);
  const score = toInt(raw.score ?? raw.standinScore);
  const rating = toInt(raw.rating ?? raw.standinRating);
  const battles = toInt(raw.battles ?? raw.standinBattles);
  const winRate = toNumber(raw.winRate ?? raw.win_rate ?? raw.standinWinRate);
  const status = toTrimmed(raw.status ?? raw.standinStatus) || (standin ? 'standin' : null);

  return {
    slot_index: slotIndex,
    slot_id: slotId,
    role: toTrimmed(raw.role ?? raw.roleName) || '역할 미지정',
    owner_id: ownerId,
    placeholder_owner_id: placeholderOwnerId,
    hero_id: heroId,
    hero_name: heroName,
    hero_summary: heroSummary,
    ready,
    joined_at: joinedAt,
    standin,
    match_source: matchSource,
    standin_placeholder: standinPlaceholder,
    score,
    rating,
    battles,
    win_rate: winRate,
    status,
  };
}

export function normalizeRoster(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const seenOwners = new Set();
  const seenSlots = new Set();
  const normalized = [];

  entries.forEach((raw, index) => {
    const entry = normalizeEntry(raw, index);
    if (!entry) return;

    const ownerKey = entry.owner_id;
    if (ownerKey) {
      if (seenOwners.has(ownerKey)) return;
      seenOwners.add(ownerKey);
    }

    const slotKey = entry.slot_id || `slot_index:${entry.slot_index}`;
    if (seenSlots.has(slotKey)) return;
    seenSlots.add(slotKey);

    normalized.push(entry);
  });

  normalized.sort((a, b) => {
    if (a.slot_index !== b.slot_index) return a.slot_index - b.slot_index;
    const ownerA = a.owner_id || '';
    const ownerB = b.owner_id || '';
    if (ownerA < ownerB) return -1;
    if (ownerA > ownerB) return 1;
    return 0;
  });

  return normalized;
}

export function collectOwnerIds(roster = []) {
  const ids = new Set();
  roster.forEach(entry => {
    if (entry?.owner_id) {
      ids.add(entry.owner_id);
    }
  });
  return Array.from(ids);
}

export function collectHeroIds(roster = []) {
  const ids = new Set();
  roster.forEach(entry => {
    if (entry?.hero_id) {
      ids.add(entry.hero_id);
    }
  });
  return Array.from(ids);
}

export function buildParticipantMap(rows = []) {
  const map = new Map();
  rows.forEach(row => {
    const ownerId = toUuid(row?.owner_id);
    if (!ownerId) return;
    map.set(ownerId, {
      score: toInt(row?.score),
      rating: toInt(row?.rating),
      battles: toInt(row?.battles),
      win_rate: toNumber(row?.win_rate),
      status: toTrimmed(row?.status),
      standin: toBoolean(row?.standin, false),
      match_source: toTrimmed(row?.match_source),
    });
  });
  return map;
}

export function buildHeroSummaryMap(rows = []) {
  const map = new Map();
  rows.forEach(row => {
    const heroId = toUuid(row?.id);
    if (!heroId) return;
    const summary = toPlainObject(row);
    map.set(heroId, summary);
  });
  return map;
}

export function hydrateRoster({
  roster = [],
  heroMap = {},
  participantMap = new Map(),
  heroSummaryMap = new Map(),
}) {
  return roster.map(entry => {
    const ownerStats = participantMap.get(entry.owner_id) || {};
    const heroMeta = heroSummaryMap.get(entry.hero_id) || heroMap[entry.hero_id || ''] || null;

    const standinFlag = ownerStats.standin === true || entry.standin === true;
    const matchSource =
      entry.match_source || ownerStats.match_source || (standinFlag ? 'async_standin' : null);

    return {
      ...entry,
      standin: standinFlag,
      match_source: matchSource,
      hero_name: heroMeta?.name || entry.hero_name || null,
      hero_summary: heroMeta || entry.hero_summary || {},
      score: entry.score ?? ownerStats.score ?? null,
      rating: entry.rating ?? ownerStats.rating ?? null,
      battles: entry.battles ?? ownerStats.battles ?? null,
      win_rate: entry.win_rate ?? ownerStats.win_rate ?? null,
      status: entry.status || ownerStats.status || (standinFlag ? 'standin' : null),
    };
  });
}

export function rosterToSupabasePayload(roster = []) {
  return roster.map(entry => ({
    slot_id: entry.slot_id,
    slot_index: entry.slot_index,
    role: entry.role,
    owner_id: entry.owner_id,
    placeholder_owner_id: entry.placeholder_owner_id,
    hero_id: entry.hero_id,
    hero_name: entry.hero_name,
    hero_summary: entry.hero_summary || {},
    ready: entry.ready === true,
    joined_at: entry.joined_at,
    standin: entry.standin === true,
    match_source: entry.match_source || null,
    standin_placeholder: entry.standin_placeholder === true,
    score: entry.score ?? null,
    rating: entry.rating ?? null,
    battles: entry.battles ?? null,
    win_rate: entry.win_rate ?? null,
    status: entry.status || null,
  }));
}

export function applySanitizedRoster(hydratedRoster = [], sanitized = []) {
  if (!Array.isArray(sanitized) || sanitized.length === 0) {
    return hydratedRoster;
  }

  const pool = hydratedRoster.map(entry => ({ entry: { ...entry }, used: false }));
  const seenSlots = new Set();

  const normalizedSanitized = [];

  sanitized.forEach(raw => {
    const slotId = toUuid(raw?.slot_id ?? raw?.slotId);
    const slotIndex = toSlotIndex(raw?.slot_index ?? raw?.slotIndex, null);
    const ownerId = toUuid(raw?.owner_id ?? raw?.ownerId);
    const heroId = toUuid(raw?.hero_id ?? raw?.heroId);
    const role = toTrimmed(raw?.role) || '역할 미지정';

    const slotKey =
      slotId || (Number.isInteger(slotIndex) && slotIndex >= 0 ? `slot_index:${slotIndex}` : null);

    if (slotKey && seenSlots.has(slotKey)) {
      return;
    }

    if (slotKey) {
      seenSlots.add(slotKey);
    }

    normalizedSanitized.push({
      slotId,
      slotIndex: Number.isInteger(slotIndex) && slotIndex >= 0 ? slotIndex : null,
      ownerId,
      heroId,
      role,
    });
  });

  if (!normalizedSanitized.length) {
    return hydratedRoster;
  }

  function consume(predicate) {
    for (const candidate of pool) {
      if (candidate.used) continue;
      if (!predicate || predicate(candidate.entry)) {
        candidate.used = true;
        return candidate.entry;
      }
    }
    return null;
  }

  return normalizedSanitized.map((raw, index) => {
    const { slotId, ownerId, slotIndex, heroId, role } = raw;
    const match = (slotId && consume(entry => entry.slot_id && entry.slot_id === slotId)) ||
      (ownerId && consume(entry => entry.owner_id && entry.owner_id === ownerId)) ||
      (Number.isInteger(slotIndex) && consume(entry => entry.slot_index === slotIndex)) ||
      consume(() => true) || {
        slot_id: slotId,
        owner_id: ownerId,
        slot_index: Number.isInteger(slotIndex) ? slotIndex : index,
        hero_id: heroId,
      };

    return {
      ...match,
      slot_id: slotId ?? match.slot_id ?? null,
      slot_index:
        Number.isInteger(slotIndex) && slotIndex >= 0 ? slotIndex : (match.slot_index ?? index),
      owner_id: ownerId ?? match.owner_id ?? null,
      hero_id: heroId ?? match.hero_id ?? null,
      role: role || match.role || '역할 미지정',
    };
  });
}
