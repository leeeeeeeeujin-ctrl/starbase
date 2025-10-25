// Utilities extracted from useStartClientEngine.js to make helpers testable
import { normalizeHeroName } from './engine/actorContext';

export function toInt(value, { min = null } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.floor(numeric);
  if (min !== null && rounded < min) return null;
  return rounded;
}

export function toTrimmed(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

export function toTrimmedString(value) {
  if (value === null || value === undefined) return null;
  const stringValue = String(value).trim();
  return stringValue ? stringValue : null;
}

export function sanitizeDropInArrivals(arrivals) {
  if (!Array.isArray(arrivals) || arrivals.length === 0) return [];
  return arrivals
    .slice(0, 8)
    .map(arrival => {
      if (!arrival || typeof arrival !== 'object') return null;
      const normalized = {};
      const ownerId =
        arrival.ownerId ?? arrival.owner_id ?? arrival.ownerID ?? arrival?.owner?.id ?? null;
      const role = toTrimmed(arrival.role);
      const heroName =
        arrival.heroName ?? arrival.hero_name ?? arrival.display_name ?? arrival.name ?? null;
      const slotIndex = toInt(arrival.slotIndex, { min: 0 });
      const timestamp = toInt(arrival.timestamp, { min: 0 });
      const queueDepth = toInt(arrival?.stats?.queueDepth, { min: 0 });
      const replacements = toInt(arrival?.stats?.replacements, { min: 0 });
      const arrivalOrder = toInt(arrival?.stats?.arrivalOrder, { min: 0 });
      const replacedOwner =
        arrival?.replaced?.ownerId ??
        arrival?.replaced?.owner_id ??
        arrival?.replacedOwnerId ??
        null;
      const replacedHero =
        arrival?.replaced?.heroName ??
        arrival?.replaced?.hero_name ??
        arrival?.replacedHeroName ??
        null;
      const status = toTrimmed(arrival.status);

      if (toTrimmed(ownerId)) normalized.ownerId = toTrimmed(ownerId);
      if (role) normalized.role = role;
      if (toTrimmed(heroName)) normalized.heroName = toTrimmed(heroName);
      if (slotIndex !== null) normalized.slotIndex = slotIndex;
      if (timestamp !== null) normalized.timestamp = timestamp;
      if (queueDepth !== null) normalized.queueDepth = queueDepth;
      if (replacements !== null) normalized.replacements = replacements;
      if (arrivalOrder !== null) normalized.arrivalOrder = arrivalOrder;
      if (toTrimmed(replacedOwner)) normalized.replacedOwnerId = toTrimmed(replacedOwner);
      if (toTrimmed(replacedHero)) normalized.replacedHeroName = toTrimmed(replacedHero);
      if (status) normalized.status = status;

      if (Object.keys(normalized).length === 0) return null;
      return normalized;
    })
    .filter(Boolean);
}

export function stripOutcomeFooter(text = '') {
  if (!text) return { body: '', footer: [] };
  const working = String(text).split(/\r?\n/);
  const footer = [];
  let captured = 0;
  let index = working.length - 1;

  while (index >= 0 && captured < 3) {
    const candidate = working[index];
    if (!candidate.trim()) {
      working.splice(index, 1);
      index -= 1;
      continue;
    }
    footer.unshift(candidate);
    working.splice(index, 1);
    captured += 1;

    while (index - 1 >= 0 && !working[index - 1].trim()) {
      working.splice(index - 1, 1);
      index -= 1;
    }

    index = working.length - 1;
  }

  while (working.length && !working[working.length - 1].trim()) {
    working.pop();
  }

  return { body: working.join('\n'), footer };
}

export function parseSlotIndex(value, fallback = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric < 0) return fallback;
  return numeric;
}

export function normalizeSlotLayoutEntries(list = []) {
  if (!Array.isArray(list) || list.length === 0) return [];

  return list
    .map((entry, index) => {
      if (!entry) return null;
      const slotIndex = parseSlotIndex(
        entry.slot_index ?? entry.slotIndex ?? entry.slotNo ?? entry.slot_no,
        index
      );
      if (slotIndex == null) return null;
      const roleValue =
        typeof entry.role === 'string'
          ? entry.role.trim()
          : typeof entry.role_name === 'string'
            ? entry.role_name.trim()
            : '';
      const ownerId = toTrimmedString(
        entry.hero_owner_id ?? entry.heroOwnerId ?? entry.ownerId ?? entry.occupantOwnerId
      );
      const heroId = toTrimmedString(
        entry.hero_id ?? entry.heroId ?? entry.occupantHeroId ?? entry.heroID
      );
      const occupantOwner = toTrimmedString(
        entry.occupant_owner_id ?? entry.occupantOwnerId ?? ownerId
      );
      const occupantHero = toTrimmedString(
        entry.occupant_hero_id ?? entry.occupantHeroId ?? heroId
      );

      return {
        id: entry.id ?? entry.slotId ?? null,
        slot_index: slotIndex,
        slotIndex,
        role: roleValue || null,
        active: entry.active !== false,
        hero_id: heroId,
        hero_owner_id: ownerId,
        occupant_owner_id: occupantOwner,
        occupant_hero_id: occupantHero,
        occupant_ready: entry.occupant_ready ?? entry.ready ?? entry.isReady ?? false,
        occupant_joined_at: entry.occupant_joined_at ?? entry.joinedAt ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.slot_index - b.slot_index);
}

export function mergeSlotLayoutSeed(primary = [], fallback = []) {
  const primaryList = Array.isArray(primary) ? primary.map(entry => ({ ...entry })) : [];
  const fallbackList = Array.isArray(fallback) ? fallback.map(entry => ({ ...entry })) : [];

  if (primaryList.length === 0) {
    return fallbackList;
  }

  const fallbackMap = new Map();
  fallbackList.forEach(entry => {
    const slotIndex = parseSlotIndex(entry.slot_index ?? entry.slotIndex);
    if (slotIndex == null) return;
    if (!fallbackMap.has(slotIndex)) {
      fallbackMap.set(slotIndex, {
        ...entry,
        slot_index: slotIndex,
        slotIndex,
      });
    }
  });

  const merged = primaryList
    .map(entry => {
      const slotIndex = parseSlotIndex(entry.slot_index ?? entry.slotIndex);
      if (slotIndex == null) return null;
      const fallbackEntry = fallbackMap.get(slotIndex);
      if (fallbackEntry) {
        fallbackMap.delete(slotIndex);
        const roleValue =
          typeof entry.role === 'string' && entry.role.trim()
            ? entry.role.trim()
            : fallbackEntry.role || null;
        return {
          ...fallbackEntry,
          ...entry,
          id: fallbackEntry.id ?? entry.id ?? null,
          slot_index: slotIndex,
          slotIndex,
          role: roleValue,
          hero_id: entry.hero_id ?? fallbackEntry.hero_id ?? null,
          hero_owner_id: entry.hero_owner_id ?? fallbackEntry.hero_owner_id ?? null,
          active: entry.active !== undefined ? entry.active : fallbackEntry.active,
          occupant_owner_id: entry.occupant_owner_id ?? fallbackEntry.occupant_owner_id ?? null,
          occupant_hero_id: entry.occupant_hero_id ?? fallbackEntry.occupant_hero_id ?? null,
          occupant_ready: entry.occupant_ready ?? fallbackEntry.occupant_ready ?? false,
          occupant_joined_at: entry.occupant_joined_at ?? fallbackEntry.occupant_joined_at ?? null,
        };
      }
      return {
        ...entry,
        slot_index: slotIndex,
        slotIndex,
        id: entry.id ?? null,
        active: entry.active !== false,
      };
    })
    .filter(Boolean);

  fallbackMap.forEach(entry => {
    merged.push(entry);
  });

  return merged.sort((a, b) => a.slot_index - b.slot_index);
}

export function buildParticipantsFromRoster(roster = []) {
  return roster
    .map((entry, index) => {
      if (!entry) return null;
      const slotIndex = parseSlotIndex(entry.slotIndex, index);
      const ownerId = toTrimmedString(entry.ownerId);
      const heroId = toTrimmedString(entry.heroId);
      const heroName = normalizeHeroName(entry.heroName || '');
      const ready = Boolean(entry.ready);

      if (!ownerId || !heroId) {
        return null;
      }

      return {
        id: `roster-${slotIndex != null ? slotIndex : index}-${ownerId}`,
        owner_id: ownerId,
        ownerId,
        role: entry.role || '',
        status: ready ? 'ready' : 'alive',
        slot_no: slotIndex,
        slotIndex,
        slot_index: slotIndex,
        score: 0,
        rating: 0,
        battles: 0,
        win_rate: null,
        hero_id: heroId,
        match_source: 'room_roster',
        standin: false,
        occupant_ready: ready,
        occupant_joined_at: entry.joinedAt || null,
        hero: {
          id: heroId,
          name: heroName || (heroId ? `캐릭터 #${heroId}` : '알 수 없는 영웅'),
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
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const slotA = parseSlotIndex(a.slot_no, 0);
      const slotB = parseSlotIndex(b.slot_no, 0);
      if (slotA != null && slotB != null) {
        if (slotA === slotB) return 0;
        return slotA - slotB;
      }
      if (slotA != null) return -1;
      if (slotB != null) return 1;
      return 0;
    });
}
