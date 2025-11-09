import { deriveParticipantOwnerId } from './participants';

function normalizeRoleName(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  return trimmed || '';
}

function parseSlotIndex(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return null;
  if (numeric < 0) return null;
  return numeric;
}

function registerIfEmpty(map, key, role) {
  if (!key || !role) return;
  const normalizedKey = String(key).trim();
  if (!normalizedKey) return;
  if (!map.has(normalizedKey)) {
    map.set(normalizedKey, role);
  }
}

function collectHeroMapRoles(heroMap, { slotRoleMap, heroRoleMap, ownerRoleMap }) {
  if (!heroMap || typeof heroMap !== 'object') return;

  const entries = heroMap instanceof Map ? heroMap.entries() : Object.entries(heroMap);
  for (const [heroKey, value] of entries) {
    const role = normalizeRoleName(
      value?.role ?? value?.assignmentRole ?? value?.matchRole ?? value?.expectedRole
    );
    registerIfEmpty(heroRoleMap, heroKey, role);
    if (value && typeof value === 'object') {
      if (value.ownerId || value.owner_id) {
        registerIfEmpty(ownerRoleMap, value.ownerId ?? value.owner_id, role);
      }
      const slotIndex = parseSlotIndex(
        value.slot_no ?? value.slotNo ?? value.slot_index ?? value.slotIndex
      );
      if (slotIndex != null) {
        registerIfEmpty(slotRoleMap, slotIndex, role);
      }
    }
  }
}

function buildRoleExpectations({ slotLayout = [], matchingMetadata = null } = {}) {
  const slotRoleMap = new Map();
  const heroRoleMap = new Map();
  const ownerRoleMap = new Map();

  if (Array.isArray(slotLayout)) {
    slotLayout.forEach(slot => {
      const slotIndex = parseSlotIndex(slot?.slot_index ?? slot?.slotIndex ?? slot?.slot_no);
      if (slotIndex == null) return;
      const role = normalizeRoleName(slot?.role);
      if (!role) return;
      slotRoleMap.set(slotIndex, role);
    });
  }

  const meta = matchingMetadata || {};
  const assignments = Array.isArray(meta.assignments) ? meta.assignments : [];
  assignments.forEach(assignment => {
    const assignmentRole = normalizeRoleName(assignment?.role);

    const roleSlots = Array.isArray(assignment?.roleSlots)
      ? assignment.roleSlots
      : Array.isArray(assignment?.role_slots)
        ? assignment.role_slots
        : [];
    roleSlots.forEach(slotValue => {
      const slotRole =
        typeof slotValue === 'object' && slotValue !== null
          ? normalizeRoleName(slotValue.role)
          : assignmentRole;
      if (!slotRole) return;
      const slotIndex =
        typeof slotValue === 'object' && slotValue !== null
          ? parseSlotIndex(slotValue.localIndex ?? slotValue.slotIndex ?? slotValue)
          : parseSlotIndex(slotValue);
      if (slotIndex != null && !slotRoleMap.has(slotIndex)) {
        slotRoleMap.set(slotIndex, slotRole);
      }
    });

    const members = Array.isArray(assignment?.members) ? assignment.members : [];
    members.forEach(member => {
      const memberRole = normalizeRoleName(member?.role) || assignmentRole;
      const slotIndex = parseSlotIndex(
        member?.slot_no ?? member?.slotNo ?? member?.slot_index ?? member?.slotIndex
      );
      if (slotIndex != null && !slotRoleMap.has(slotIndex)) {
        slotRoleMap.set(slotIndex, memberRole);
      }
      registerIfEmpty(
        heroRoleMap,
        member?.hero_id ?? member?.heroId ?? member?.heroID ?? member?.hero?.id,
        memberRole
      );
      registerIfEmpty(
        ownerRoleMap,
        member?.owner_id ?? member?.ownerId ?? member?.ownerID ?? member?.owner?.id,
        memberRole
      );
    });
  });

  collectHeroMapRoles(meta?.heroMap, { slotRoleMap, heroRoleMap, ownerRoleMap });

  return { slotRoleMap, heroRoleMap, ownerRoleMap };
}

function buildRemovalEntry(participant, slotIndex, expectedRole, actualRole, sources) {
  const heroId = participant?.hero?.id ?? participant?.hero_id ?? null;
  const ownerId = deriveParticipantOwnerId(participant);
  return {
    participant,
    participantId: participant?.id ?? null,
    heroId: heroId != null ? String(heroId).trim() : null,
    ownerId: ownerId != null ? String(ownerId).trim() : null,
    heroName:
      participant?.hero?.name ??
      participant?.hero_name ??
      participant?.display_name ??
      participant?.name ??
      null,
    slotIndex,
    expectedRole,
    actualRole,
    sources,
  };
}

export function reconcileParticipantsForGame({
  participants = [],
  slotLayout = [],
  matchingMetadata = null,
} = {}) {
  const expectations = buildRoleExpectations({ slotLayout, matchingMetadata });
  const sanitized = [];
  const removed = [];

  const rows = Array.isArray(participants) ? participants.filter(Boolean) : [];
  rows.forEach(participant => {
    const slotIndex = parseSlotIndex(
      participant?.slot_no ?? participant?.slotNo ?? participant?.slot_index ?? null
    );
    const heroId = participant?.hero?.id ?? participant?.hero_id ?? null;
    const ownerId = deriveParticipantOwnerId(participant);
    const actualRole = normalizeRoleName(participant?.role);

    const sources = [];
    if (slotIndex != null) {
      const slotRole = expectations.slotRoleMap.get(slotIndex) || null;
      if (slotRole) {
        sources.push({ type: 'slot', slotIndex, role: slotRole });
      }
    }
    if (heroId != null) {
      const key = String(heroId).trim();
      const heroRole = expectations.heroRoleMap.get(key) || null;
      if (heroRole) {
        sources.push({ type: 'hero', heroId: key, role: heroRole });
      }
    }
    if (ownerId != null) {
      const key = String(ownerId).trim();
      const ownerRole = expectations.ownerRoleMap.get(key) || null;
      if (ownerRole) {
        sources.push({ type: 'owner', ownerId: key, role: ownerRole });
      }
    }

    const expected = sources.find(entry => entry.role) || null;
    if (expected && actualRole && actualRole !== expected.role) {
      removed.push(buildRemovalEntry(participant, slotIndex, expected.role, actualRole, sources));
      return;
    }

    sanitized.push(participant);
  });

  return { participants: sanitized, removed, expectations };
}

export function formatPreflightSummary(removed = []) {
  if (!Array.isArray(removed) || removed.length === 0) {
    return '';
  }

  return removed
    .map(entry => {
      const heroLabel = entry.heroName || entry.heroId || '이름 없는 참가자';
      const slotLabel =
        entry.slotIndex != null && entry.slotIndex >= 0
          ? `슬롯 ${entry.slotIndex}`
          : '슬롯 정보 없음';
      const expected = entry.expectedRole || '역할 미지정';
      const actual = entry.actualRole || '역할 없음';
      return `${slotLabel} ${heroLabel}: 기대 역할 ${expected}, 실제 ${actual}`;
    })
    .join('\n');
}

export { normalizeRoleName as normalizePreflightRole, parseSlotIndex as parsePreflightSlot };
