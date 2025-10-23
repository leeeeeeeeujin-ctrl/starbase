// lib/rank/matchRoleSummary.js
// Shared helpers for summarising role slot readiness across matchmaking
// pipelines and UI overlays.

function normalizeRoleName(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed;
}

function coerceSlotCount(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric < 0) return fallback;
  return Math.trunc(numeric);
}

function ensureBucket({ bucketMap, order, orderSet }, roleName) {
  if (!roleName) return null;
  if (!bucketMap.has(roleName)) {
    bucketMap.set(roleName, { role: roleName, total: 0, filled: 0 });
  }
  if (!orderSet.has(roleName)) {
    orderSet.add(roleName);
    order.push(roleName);
  }
  return bucketMap.get(roleName);
}

function normaliseRolesList(rawRoles = []) {
  if (!Array.isArray(rawRoles)) return [];
  return rawRoles
    .map(entry => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        const name = normalizeRoleName(entry);
        if (!name) return null;
        return { name, slotCount: 1 };
      }
      const name = normalizeRoleName(entry.name ?? entry.role);
      if (!name) return null;
      const slotRaw = entry.slot_count ?? entry.slotCount ?? entry.capacity ?? entry.slots;
      const slotCount = coerceSlotCount(slotRaw, null);
      return { name, slotCount };
    })
    .filter(Boolean);
}

function markSlotOccupancy({ slot, helpers, hasLayout }) {
  if (!slot) return;
  const roleName = normalizeRoleName(slot.role);
  if (!roleName) return;
  const bucket = ensureBucket(helpers, roleName);
  if (!bucket) return;

  if (!hasLayout) {
    bucket.total += 1;
  }

  const occupied =
    slot.occupied === true ||
    Boolean(slot.member) ||
    (Array.isArray(slot.members) && slot.members.some(Boolean)) ||
    slot.heroId != null ||
    slot.hero_id != null ||
    slot.heroOwnerId != null ||
    slot.hero_owner_id != null;

  if (occupied) {
    bucket.filled += 1;
  }
}

export function buildRoleSummaryBuckets({
  roles = [],
  slotLayout = [],
  assignments = [],
  rooms = [],
} = {}) {
  const helpers = {
    bucketMap: new Map(),
    order: [],
    orderSet: new Set(),
  };

  const layoutSlots = Array.isArray(slotLayout) ? slotLayout : [];
  const hasLayout = layoutSlots.length > 0;

  if (hasLayout) {
    layoutSlots.forEach(slot => {
      if (!slot) return;
      const roleName = normalizeRoleName(slot.role);
      if (!roleName) return;
      const bucket = ensureBucket(helpers, roleName);
      if (!bucket) return;
      bucket.total += 1;
    });
  }

  const assignmentSource = Array.isArray(assignments) ? assignments : [];
  const roomSource = Array.isArray(rooms) ? rooms : [];

  if (assignmentSource.length) {
    assignmentSource.forEach(assignment => {
      if (!assignment) return;
      const roleSlots = Array.isArray(assignment.roleSlots)
        ? assignment.roleSlots
        : Array.isArray(assignment.role_slots)
          ? assignment.role_slots
          : [];

      if (roleSlots.length) {
        roleSlots.forEach(slot => {
          markSlotOccupancy({ slot, helpers, hasLayout });
        });
        return;
      }

      const fallbackRole = normalizeRoleName(assignment.role);
      if (!fallbackRole) return;
      const bucket = ensureBucket(helpers, fallbackRole);
      if (!bucket) return;
      const members = Array.isArray(assignment.members) ? assignment.members.filter(Boolean) : [];

      if (!hasLayout) {
        const rawCount =
          assignment.slotCount ?? assignment.slot_count ?? assignment.capacity ?? members.length;
        const slotCount = coerceSlotCount(rawCount, members.length || 1);
        bucket.total += slotCount;
        bucket.filled += Math.min(slotCount, members.length);
      } else {
        bucket.filled += members.length;
      }
    });
  } else if (roomSource.length) {
    roomSource.forEach(room => {
      if (!room) return;
      const slots = Array.isArray(room.slots) ? room.slots : [];
      slots.forEach(slot => {
        markSlotOccupancy({ slot, helpers, hasLayout });
      });
    });
  }

  const normalizedRoles = normaliseRolesList(roles);
  normalizedRoles.forEach(entry => {
    if (!entry) return;
    if (!Number.isInteger(entry.slotCount) || entry.slotCount < 0) return;
    const name = entry.name;
    if (hasLayout && !helpers.bucketMap.has(name)) {
      return;
    }
    const bucket = ensureBucket(helpers, name);
    if (!bucket) return;
    if (hasLayout) {
      if (bucket.total <= 0) {
        bucket.total = entry.slotCount;
      } else {
        bucket.total = Math.max(bucket.total, entry.slotCount);
      }
    } else if (bucket.total <= 0) {
      bucket.total = entry.slotCount;
    } else {
      bucket.total = Math.max(bucket.total, entry.slotCount);
    }
  });

  const buckets =
    helpers.order.length > 0
      ? helpers.order.map(name => helpers.bucketMap.get(name)).filter(Boolean)
      : Array.from(helpers.bucketMap.values());

  return buckets
    .map(bucket => {
      const total = Math.max(0, coerceSlotCount(bucket.total, 0));
      const filledRaw = Math.max(0, Number(bucket.filled) || 0);
      const filled = total > 0 ? Math.min(filledRaw, total) : filledRaw;
      const missing = total > 0 ? Math.max(0, total - filled) : 0;
      return {
        role: bucket.role,
        total,
        filled,
        missing,
        ready: total > 0 && missing === 0,
      };
    })
    .filter(entry => entry.total > 0);
}

export function computeRoleReadiness(summaryOptions = {}) {
  const buckets = buildRoleSummaryBuckets(summaryOptions);
  const ready = buckets.length > 0 && buckets.every(bucket => bucket.ready);
  return { ready, buckets };
}

export default buildRoleSummaryBuckets;
