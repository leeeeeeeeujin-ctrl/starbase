import {
  START_SESSION_KEYS,
  readStartSessionValue,
  writeStartSessionValue,
  subscribeStartSession,
} from './startSessionChannel';
import { normalizeHeroIdValue } from './participantUtils';

const REGISTRY_KEY = START_SESSION_KEYS.CONNECTIONS;
const DEFAULT_STATE = Object.freeze({ version: 1, updatedAt: 0, entries: [] });
const DEFAULT_SOURCE = 'start-connection-registry';

function normaliseString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'object') {
    if (typeof value.id !== 'undefined') {
      return normaliseString(value.id);
    }
  }
  return '';
}

function normaliseGameId(value) {
  const result = normaliseString(value);
  return result || '';
}

function normaliseOwnerId(value) {
  const result = normaliseString(value);
  return result || '';
}

function normalizeQueueId(value) {
  const result = normaliseString(value);
  return result || '';
}

function normaliseRole(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    if (typeof value.role === 'string') return value.role.trim();
    if (typeof value.name === 'string') return value.name.trim();
  }
  return '';
}

function normaliseSlotIndices(value, memberCount = 0) {
  if (!Array.isArray(value)) {
    return [];
  }
  const indices = value
    .map(slot => {
      if (typeof slot === 'number') {
        return Number(slot);
      }
      if (typeof slot === 'object' && slot !== null) {
        const candidate = slot.slotIndex ?? slot.slot_index ?? slot.index;
        if (Number.isFinite(Number(candidate))) {
          return Number(candidate);
        }
      }
      return Number.NaN;
    })
    .filter(slot => Number.isInteger(slot) && slot >= 0);
  if (!indices.length && memberCount > 0) {
    const fallback = [];
    for (let index = 0; index < memberCount; index += 1) {
      fallback.push(index);
    }
    return fallback;
  }
  return indices;
}

function resolveHeroFromMap(heroMap, heroId) {
  if (!heroId) return null;
  if (!heroMap) return null;
  if (heroMap instanceof Map) {
    return heroMap.get(heroId) || heroMap.get(String(heroId)) || null;
  }
  if (typeof heroMap === 'object' && heroMap !== null) {
    if (Object.prototype.hasOwnProperty.call(heroMap, heroId)) {
      return heroMap[heroId];
    }
    if (Object.prototype.hasOwnProperty.call(heroMap, String(heroId))) {
      return heroMap[String(heroId)];
    }
  }
  return null;
}

function serialiseState(state, { source = DEFAULT_SOURCE, broadcast = true } = {}) {
  if (typeof window === 'undefined') return false;
  try {
    const payload = JSON.stringify(state);
    writeStartSessionValue(REGISTRY_KEY, payload, { source, broadcast });
    return true;
  } catch (error) {
    console.warn('[startConnectionRegistry] Failed to store registry state:', error);
    return false;
  }
}

function parseState(raw) {
  if (!raw) return DEFAULT_STATE;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_STATE;
    }
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return {
      version: Number.isFinite(Number(parsed.version)) ? Number(parsed.version) : 1,
      updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : 0,
      entries: entries.map(entry => normaliseEntry(entry)).filter(Boolean),
    };
  } catch (error) {
    console.warn('[startConnectionRegistry] Failed to parse registry state:', error);
    return DEFAULT_STATE;
  }
}

function normaliseEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  const gameId = normaliseGameId(entry.gameId);
  const ownerId = normaliseOwnerId(entry.ownerId);
  if (!gameId || !ownerId) {
    return null;
  }

  const viewerIdRaw = normaliseOwnerId(entry.viewerId);
  const viewerId = viewerIdRaw || ownerId;
  const heroId = normalizeHeroIdValue(entry.heroId);
  const role = normaliseRole(entry.role);
  const slotIndex = Number(entry.slotIndex);
  const normalizedSlotIndex = Number.isInteger(slotIndex) && slotIndex >= 0 ? slotIndex : null;
  const slotIndices = normaliseSlotIndices(
    entry.slotIndices || entry.roleSlots || [],
    entry.members?.length || 0
  );

  return {
    gameId,
    ownerId,
    viewerId,
    heroId: heroId || null,
    heroName: normaliseString(entry.heroName || entry.hero_name || entry.name) || null,
    role: role || null,
    slotIndex: normalizedSlotIndex,
    slotIndices,
    updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : Date.now(),
    matchCode: normaliseString(entry.matchCode) || null,
    assignmentGroup: normaliseString(entry.assignmentGroup || entry.groupKey) || null,
  };
}

function normaliseRoleSlotEntries(roleSlots) {
  if (!Array.isArray(roleSlots)) return [];
  return roleSlots.map(slot => {
    if (!slot || typeof slot !== 'object') {
      return {
        role: null,
        slotIndex: Number.isFinite(Number(slot)) ? Number(slot) : null,
        members: [],
      };
    }
    const role = normaliseRole(slot.role ?? slot.name);
    const slotIndexRaw = slot.slotIndex ?? slot.slot_index ?? slot.index;
    const slotIndex = Number.isFinite(Number(slotIndexRaw)) ? Number(slotIndexRaw) : null;
    const members = Array.isArray(slot.members) ? slot.members : [];
    const heroId = slot.heroId ?? slot.hero_id ?? null;
    const id = slot.id ?? null;
    return {
      role,
      slotIndex,
      members,
      heroId,
      id,
    };
  });
}

function membersMatch(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  const leftId = normalizeQueueId(left.id ?? left.queue_id ?? left.queueId);
  const rightId = normalizeQueueId(right.id ?? right.queue_id ?? right.queueId);
  if (leftId && rightId && leftId === rightId) return true;
  const leftHero = normalizeHeroIdValue(left.hero_id ?? left.heroId);
  const rightHero = normalizeHeroIdValue(right.hero_id ?? right.heroId);
  if (leftHero && rightHero && leftHero === rightHero) return true;
  const leftOwner = normaliseOwnerId(left.owner_id ?? left.ownerId);
  const rightOwner = normaliseOwnerId(right.owner_id ?? right.ownerId);
  if (leftOwner && rightOwner && leftOwner === rightOwner && leftHero && rightHero) {
    return true;
  }
  return false;
}

function matchMemberToSlot(member, slots, usedIndices) {
  if (!member || !Array.isArray(slots)) return null;

  for (let index = 0; index < slots.length; index += 1) {
    if (usedIndices.has(index)) continue;
    const slot = slots[index];
    if (!slot) continue;
    const members = Array.isArray(slot.members) ? slot.members : [];
    if (members.some(candidate => membersMatch(candidate, member))) {
      usedIndices.add(index);
      return { slot, index };
    }
  }

  for (let index = 0; index < slots.length; index += 1) {
    if (usedIndices.has(index)) continue;
    const slot = slots[index];
    if (!slot) continue;
    if (slot.role && slot.role === normaliseRole(member.role)) {
      usedIndices.add(index);
      return { slot, index };
    }
  }

  return null;
}

function readRawState() {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  const raw = readStartSessionValue(REGISTRY_KEY);
  return parseState(raw);
}

function buildEntryKey(entry) {
  return `${entry.gameId}::${entry.ownerId}`;
}

function validateEntry(entry, existingMap) {
  // 중복 키는 최신 정보로 덮어씁니다. 불일치가 있으면 경고만 남기고 업데이트 허용.
  const key = buildEntryKey(entry);
  if (existingMap.has(key)) {
    const existing = existingMap.get(key);
    if (
      existing.slotIndex !== entry.slotIndex ||
      existing.role !== entry.role ||
      existing.ownerId !== entry.ownerId ||
      existing.heroId !== entry.heroId
    ) {
      console.warn('[startConnectionRegistry] 중복 키 불일치:', {
        key,
        기존: existing,
        신규: entry,
      });
    }
  }
  return true;
}

function mergeEntries(existingEntries, updates) {
  const merged = new Map();
  existingEntries.forEach(entry => {
    const normalized = normaliseEntry(entry);
    if (!normalized) return;
    merged.set(buildEntryKey(normalized), normalized);
  });
  updates.forEach(entry => {
    const normalized = normaliseEntry(entry);
    if (!normalized) return;
    if (validateEntry(normalized, merged)) {
      merged.set(buildEntryKey(normalized), normalized);
    }
  });
  return Array.from(merged.values());
}

export function readConnectionRegistry() {
  return readRawState();
}

export function getConnectionEntriesForGame(gameId) {
  const state = readRawState();
  const key = normaliseGameId(gameId);
  if (!key) return [];
  return state.entries.filter(entry => entry.gameId === key);
}

export function registerConnectionEntries(entries, { source = DEFAULT_SOURCE } = {}) {
  if (!Array.isArray(entries) || !entries.length) return false;
  const state = readRawState();
  const mergedEntries = mergeEntries(state.entries, entries);
  return serialiseState(
    {
      version: 1,
      updatedAt: Date.now(),
      entries: mergedEntries,
    },
    { source }
  );
}

export function registerMatchConnections({
  gameId,
  match,
  viewerId,
  source = DEFAULT_SOURCE,
} = {}) {
  const key = normaliseGameId(gameId);
  if (!key) return [];
  if (!match || typeof match !== 'object') return [];

  const assignments = Array.isArray(match.assignments) ? match.assignments : [];
  if (!assignments.length) return [];

  const heroMap = match.heroMap || null;
  const timestamp = Date.now();
  const entries = [];

  assignments.forEach(assignment => {
    if (!assignment || typeof assignment !== 'object') return;
    const members = Array.isArray(assignment.members) ? assignment.members : [];
    if (!members.length) return;
    const slotEntries = normaliseRoleSlotEntries(assignment.roleSlots);
    const usedSlotIndices = new Set();

    members.forEach((member, memberIndex) => {
      if (!member || typeof member !== 'object') return;
      const ownerId = normaliseOwnerId(member.owner_id ?? member.ownerId);
      if (!ownerId) return;
      const heroId = normalizeHeroIdValue(
        member.hero_id ?? member.heroId ?? member.hero?.id ?? null
      );
      const heroRecord = resolveHeroFromMap(heroMap, heroId);
      const heroName =
        normaliseString(heroRecord?.name) ||
        normaliseString(heroRecord?.hero_name) ||
        normaliseString(member.hero_name ?? member.heroName ?? member.name) ||
        null;
      let matched = matchMemberToSlot(member, slotEntries, usedSlotIndices);
      // Fallback: if no member/role match but exactly one roleSlot is provided, use that slot
      if (!matched && Array.isArray(slotEntries) && slotEntries.length === 1) {
        matched = { slot: slotEntries[0], index: 0 };
        usedSlotIndices.add(0);
      }
      const slotIndex = matched?.slot?.slotIndex ?? matched?.index ?? null;
      const slotIndices =
        matched && matched.slot
          ? normaliseSlotIndices([matched.slot], 1)
          : normaliseSlotIndices(assignment.roleSlots, members.length);
      const role = matched?.slot?.role || normaliseRole(assignment.role);

      entries.push({
        gameId: key,
        ownerId,
        viewerId:
          viewerId && normaliseOwnerId(viewerId) === ownerId ? normaliseOwnerId(viewerId) : ownerId,
        heroId: heroId || null,
        heroName,
        role,
        slotIndex: Number.isInteger(slotIndex) && slotIndex >= 0 ? slotIndex : null,
        slotIndices,
        updatedAt: timestamp,
        matchCode: normaliseString(match.matchCode) || null,
        assignmentGroup: normaliseString(assignment.groupKey || assignment.group_key) || null,
      });
    });
  });

  if (!entries.length) return [];
  registerConnectionEntries(entries, { source });
  return entries;
}

export function removeConnectionEntries({
  gameId,
  ownerIds = [],
  viewerIds = [],
  source = DEFAULT_SOURCE,
} = {}) {
  const state = readRawState();
  if (!state.entries.length) return false;

  const key = normaliseGameId(gameId);
  if (!key) return false;

  const ownerSet = new Set(ownerIds.map(value => normaliseOwnerId(value)).filter(Boolean));
  const viewerSet = new Set(viewerIds.map(value => normaliseOwnerId(value)).filter(Boolean));

  const nextEntries = state.entries.filter(entry => {
    if (entry.gameId !== key) {
      return true;
    }
    if (!ownerSet.size && !viewerSet.size) {
      return false;
    }
    if (ownerSet.size && ownerSet.has(entry.ownerId)) {
      return false;
    }
    if (viewerSet.size && entry.viewerId && viewerSet.has(entry.viewerId)) {
      return false;
    }
    return true;
  });

  if (nextEntries.length === state.entries.length) {
    return false;
  }

  return serialiseState(
    {
      version: 1,
      updatedAt: Date.now(),
      entries: nextEntries,
    },
    { source }
  );
}

export function subscribeConnectionRegistry(callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  return subscribeStartSession(event => {
    if (!event || !Array.isArray(event.keys)) return;
    if (!event.keys.includes(REGISTRY_KEY)) return;
    try {
      callback(readRawState());
    } catch (error) {
      console.warn('[startConnectionRegistry] Subscription callback failed:', error);
    }
  });
}
