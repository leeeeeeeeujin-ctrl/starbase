import { resolveMemberLabel } from './matchUtils';

function normalizeRoleKey(value) {
  if (!value) return '';
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : '';
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function registerMembers({ bucket, members, signature, heroMap }) {
  if (!bucket) return;
  if (!Array.isArray(members) || members.length === 0) {
    return;
  }

  members.forEach((member, index) => {
    if (!member) return;
    const rawKey =
      member.queue_id ??
      member.queueId ??
      member.id ??
      member.hero_id ??
      member.heroId ??
      `${signature}-${index}`;
    const key = `${signature}-${rawKey}`;
    if (bucket.memberKeys.has(key)) {
      return;
    }
    bucket.memberKeys.add(key);
    bucket.members.push({
      key,
      label: resolveMemberLabel({ member, heroMap }),
    });
  });
}

function ensureBucket(map, roleName, fallbackLabel) {
  const primaryLabel = typeof roleName === 'string' ? roleName.trim() : '';
  const fallback = typeof fallbackLabel === 'string' ? fallbackLabel.trim() : '';
  const normalized = normalizeRoleKey(primaryLabel || fallback);
  if (!normalized) {
    return null;
  }
  let bucket = map.get(normalized);
  if (!bucket) {
    bucket = {
      role: primaryLabel || fallback || '',
      members: [],
      memberKeys: new Set(),
    };
    map.set(normalized, bucket);
  } else if (!bucket.role && (primaryLabel || fallback)) {
    bucket.role = primaryLabel || fallback;
  }
  return bucket;
}

export function buildMatchOverlaySummary({
  assignments = [],
  heroMap = new Map(),
  roleSummaries = [],
  rooms = [],
} = {}) {
  const bucketMap = new Map();

  const normalizedAssignments = Array.isArray(assignments) ? assignments : [];

  normalizedAssignments.forEach((assignment, assignmentIndex) => {
    if (!assignment) return;
    const fallbackRole =
      typeof assignment.role === 'string' && assignment.role.trim() ? assignment.role.trim() : '';
    const roleSlots = Array.isArray(assignment.roleSlots)
      ? assignment.roleSlots
      : Array.isArray(assignment.role_slots)
        ? assignment.role_slots
        : [];

    if (roleSlots.length) {
      roleSlots.forEach((slot, slotIndex) => {
        if (!slot) return;
        const slotRole = typeof slot.role === 'string' && slot.role.trim() ? slot.role.trim() : '';
        const bucket = ensureBucket(bucketMap, slotRole, fallbackRole);
        if (!bucket) return;
        const slotMembers = Array.isArray(slot.members)
          ? slot.members.filter(Boolean)
          : slot.member
            ? [slot.member]
            : [];
        registerMembers({
          bucket,
          members: slotMembers,
          signature: `assignment-${assignmentIndex}-${slotIndex}`,
          heroMap,
        });
      });
      return;
    }

    const members = Array.isArray(assignment.members) ? assignment.members.filter(Boolean) : [];
    if (!members.length || !fallbackRole) {
      return;
    }
    const bucket = ensureBucket(bucketMap, fallbackRole);
    if (!bucket) return;
    registerMembers({
      bucket,
      members,
      signature: `assignment-${assignmentIndex}-fallback`,
      heroMap,
    });
  });

  if (bucketMap.size === 0 && Array.isArray(rooms)) {
    rooms.forEach((room, roomIndex) => {
      if (!room) return;
      const slots = Array.isArray(room.slots) ? room.slots : [];
      slots.forEach((slot, slotIndex) => {
        if (!slot) return;
        const roleName = typeof slot.role === 'string' ? slot.role.trim() : '';
        const bucket = ensureBucket(bucketMap, roleName);
        if (!bucket) return;
        const members = ensureArray(slot.member).filter(Boolean);
        registerMembers({
          bucket,
          members,
          signature: `room-${roomIndex}-${slotIndex}`,
          heroMap,
        });
      });
    });
  }

  const normalizedSummaries = Array.isArray(roleSummaries) ? roleSummaries : [];
  if (normalizedSummaries.length) {
    return normalizedSummaries.map((summary, index) => {
      if (!summary) {
        return {
          key: `role-${index}-unknown`,
          role: `역할 ${index + 1}`,
          members: [],
          missing: 0,
          filled: 0,
          total: 0,
        };
      }
      const normalized = normalizeRoleKey(summary.role);
      const bucket = normalized ? bucketMap.get(normalized) : null;
      const roleLabel =
        (bucket && bucket.role) ||
        (typeof summary.role === 'string' && summary.role.trim()) ||
        `역할 ${index + 1}`;
      const members = bucket ? bucket.members.slice() : [];
      return {
        key: `role-${index}-${normalized || 'fallback'}`,
        role: roleLabel,
        members,
        missing: Number.isFinite(Number(summary.missing)) ? Number(summary.missing) : 0,
        filled: Number.isFinite(Number(summary.filled)) ? Number(summary.filled) : members.length,
        total: Number.isFinite(Number(summary.total)) ? Number(summary.total) : members.length,
      };
    });
  }

  const buckets = Array.from(bucketMap.entries());
  if (!buckets.length) {
    return [];
  }

  return buckets.map(([normalized, bucket], index) => ({
    key: `role-${index}-${normalized || 'bucket'}`,
    role: bucket.role || `역할 ${index + 1}`,
    members: bucket.members.slice(),
    missing: 0,
    filled: bucket.members.length,
    total: bucket.members.length,
  }));
}

export default buildMatchOverlaySummary;
