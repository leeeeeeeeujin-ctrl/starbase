// Core rank matching helpers.
//
// This module intentionally keeps the matching algorithm in the middle of the
// pipeline: it expects the caller to hand us role capacity information and the
// current matching queue, and it produces a plan that tells the caller which
// queued entries should fill each role. Wiring this output back into Supabase
// (updating slots, marking queue entries, etc.) is left for the layer that
// invokes these helpers.

const DEFAULT_SCORE_WINDOWS = Object.freeze([100, 200]);
const FALLBACK_SCORE = 1000;

let roomSequence = 0;

function nextRoomId() {
  roomSequence += 1;
  return `room-${roomSequence}`;
}

function matchSoloRankParticipants(options = {}) {
  return matchRankParticipants(options);
}

function matchDuoRankParticipants(options = {}) {
  return matchRankParticipants(options);
}

function matchRankParticipants({
  roles = [],
  queue = [],
  scoreWindows = DEFAULT_SCORE_WINDOWS,
  // If the client explicitly requests a relaxed score window (user pressed
  // the "widen window" button), supply it here as a number. It will only be
  // used as an explicit override for the final relaxed attempt and will be
  // subject to conservative caps inside the recombiner.
  userRequestedWindow = null,
} = {}) {
  const template = buildRoomTemplate(roles);
  const totalSlots = template.totalSlots || 0;

  // No active slots configured -> nothing to do
  if (!totalSlots) {
    return buildResult({
      ready: false,
      assignments: [],
      rooms: [],
      totalSlots: 0,
      maxWindow: 0,
      error: { type: 'no_active_slots' },
    });
  }

  const maxWindowAllowed = normaliseWindowThreshold(scoreWindows);

  // Build groups and role pools from the provided queue
  const groups = buildQueueGroups(queue || []);
  const { pools: rolePools, skipped } = buildRolePools({ template, groups });

  // Greedy allocation from role pools
  const allocation = allocateRoomsFromPools({ template, rolePools, maxWindowAllowed });
  let rooms = Array.isArray(allocation.rooms) ? allocation.rooms : [];
  const combinedUnplaced = Array.isArray(allocation.unplaced) ? allocation.unplaced : [];

  // Finalize rooms and build assignments
  rooms.forEach(r => finalizeRoom(r));
  const assignments = [];
  let ready = false;
  let maxWindowUsed = 0;

  for (const room of rooms) {
    if (!room) continue;
    assignments.push(buildRoomAssignment(room, template));
    if (room.ready) ready = true;
    maxWindowUsed = Math.max(maxWindowUsed, room.maxScoreGap || 0);
  }

  const serializedRooms = rooms.map(room => serializeRoom(room, template));
  // If nothing was marked ready, try a conservative recombination pass:
  // attempt to form a single complete room by reassigning groups from the
  // existing rooms + unplaced groups. This helps recover cases where the
  // greedy placement created multiple partial rooms but a different grouping
  // could produce one full room. The search is intentionally bounded.
  if (!ready) {
    try {
      const recombined = tryFormFullRoomFromGroups({ template, rooms, combinedUnplaced, maxWindowAllowed, userRequestedWindow });
      if (recombined) {
        // replace rooms with recombined primary room + any leftover minimal rooms
        rooms.unshift(recombined);
        // recompute serializedRooms and assignments to reflect the new primary room
        // note: keep existing rooms after the newly formed room
        maxWindowUsed = Math.max(maxWindowUsed || 0, recombined.maxScoreGap || 0);
        ready = true;
      }
    } catch (e) {
      // swallow errors from the optional pass to keep matching deterministic
      // eslint-disable-next-line no-console
      console.error('[matching-recombine] failed', e && e.stack ? e.stack : e);
    }
  }
  let error = null;
  let suggestion = null;
  if (!ready) {
    // If there are unplaced groups, this often means specific score-bands
    // are missing; detect whether a small, local window relaxation could
    // allow placement and surface a conservative suggestion the UI can
    // present to the user (e.g., "relax window and retry (with penalty)".)
    if (combinedUnplaced.length) {
      // basic error payload describing which groups remained
      error = {
        type: 'insufficient_candidates',
        groups: combinedUnplaced.map(entry => ({
          role: entry.role,
          reason: entry.reason,
          size: entry.group?.size || (entry.group && entry.group.members ? entry.group.members.length : 0),
        })),
      };

      try {
        // compute minimal relax needed to place any unplaced group into an
        // existing partial room (respecting role capacity). We'll suggest
        // only conservative relax amounts and include a penalty estimate.
        const SUGGEST_MAX_FACTOR = 3;
        const SUGGEST_RELAX_CAP = 400;
        let minNeeded = Number.POSITIVE_INFINITY;
        for (const u of combinedUnplaced) {
          const g = u && (u.group || u);
          if (!g) continue;
          const gScore = Number.isFinite(Number(g.score)) ? Number(g.score) : FALLBACK_SCORE;
          for (const r of rooms) {
            if (!r || !r.slots) continue;
            // only consider rooms that have capacity for this role
            if (!roomHasRoleCapacity(r, g.role, g.size || (Array.isArray(g.members) ? g.members.length : 0))) continue;
            const roomAnchor = Number.isFinite(r.anchorScore) ? Number(r.anchorScore) : null;
            const gap = roomAnchor != null ? Math.abs(gScore - roomAnchor) : 0;
            if (gap > maxWindowAllowed) {
              const needed = gap - maxWindowAllowed;
              if (needed < minNeeded) minNeeded = needed;
            }
          }
        }

        if (Number.isFinite(minNeeded) && minNeeded > 0 && minNeeded <= SUGGEST_RELAX_CAP) {
          // propose a relax window that is capped and factor-limited
          const propose = Math.min(maxWindowAllowed + minNeeded, Math.min(maxWindowAllowed * SUGGEST_MAX_FACTOR, SUGGEST_RELAX_CAP));
          suggestion = {
            type: 'relax_window',
            reason: 'candidate_score_gap',
            currentWindow: maxWindowAllowed,
            suggestedWindow: Math.round(propose),
            minimalIncrease: Math.round(minNeeded),
            penaltyEstimate: Math.round(minNeeded), // simple heuristic: penalty ~= extra window
          };
        }
      } catch (e) {
        // ignore suggestion failures
      }
    } else if (!assignments.length) {
      error = { type: 'no_candidates' };
    }
  }

  // Optional debug logging for intermittent matching failures. Set DEBUG_MATCHING=1
  // in the environment when running `node scripts/runSelftest.js` to get detailed
  // information about groups, role pools, rooms, assignments and unplaced entries.
  if (process && process.env && process.env.DEBUG_MATCHING === '1') {
    try {
      const debug = {
        template: { totalSlots: template.totalSlots, signature: template.signature },
        groups: groups.map(g => ({ role: g.role, size: g.size, score: g.score, joinedAt: g.joinedAt })),
        skipped: skipped.map(s => ({ role: s.group.role, reason: s.reason, size: s.group.size })),
        rolePools: Array.from(rolePools.entries()).reduce((acc, [k, v]) => {
          acc[k] = { capacity: v.capacity, groups: v.groups.map(g => ({ role: g.role, size: g.size, score: g.score })) };
          return acc;
        }, {}),
        rooms: rooms.map(r => ({ id: r.id, filledSlots: r.filledSlots, missingSlots: r.missingSlots, ready: r.ready, maxScoreGap: r.maxScoreGap })),
        assignmentsCount: assignments.length,
        combinedUnplaced: combinedUnplaced.map(u => ({ role: u.role, reason: u.reason, size: u.group?.size })),
        maxWindowUsed,
      };
        if (suggestion) debug.suggestion = suggestion;
        // eslint-disable-next-line no-console
        console.log('[matching-debug]', JSON.stringify(debug, null, 2));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[matching-debug] failed to serialize debug info', e && e.stack ? e.stack : e);
    }
  }

  return buildResult({
    ready,
    assignments,
    rooms: serializedRooms,
    totalSlots,
    maxWindow: maxWindowUsed,
      error,
      suggestion,
  });
}


function buildRoomTemplate(rawRoles) {
  const normalized = normalizeRoles(rawRoles);
  const slots = [];
  const roles = new Map();
  let cursor = 0;

  for (const role of normalized) {
    const roleName = normalizeRoleLabel(role.name);
    const capacity = coerceInteger(role.slotCount, 0);
    if (!roleName || capacity <= 0) continue;

    roles.set(roleName, {
      capacity,
      offset: cursor,
    });

    for (let index = 0; index < capacity; index += 1) {
      slots.push({ role: roleName, slotIndex: index });
    }

    cursor += capacity;
  }

  const signature = slots.map(slot => `${slot.role}#${slot.slotIndex}`).join('|');

  return {
    roles,
    slots,
    totalSlots: slots.length,
    signature,
  };
}

function normalizeRoleLabel(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value !== null) {
    if (typeof value.name === 'string') return value.name.trim();
    if (typeof value.role === 'string') return value.role.trim();
  }
  return '';
}

function normaliseWindowThreshold(windows = DEFAULT_SCORE_WINDOWS) {
  if (!Array.isArray(windows) || windows.length === 0) {
    return DEFAULT_SCORE_WINDOWS[DEFAULT_SCORE_WINDOWS.length - 1];
  }

  let max = 0;
  windows.forEach(value => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric > max) {
      max = numeric;
    }
  });

  if (max <= 0) {
    return DEFAULT_SCORE_WINDOWS[DEFAULT_SCORE_WINDOWS.length - 1];
  }

  return max;
}

function buildQueueGroups(queue) {
  const normalized = normalizeQueue(queue);
  if (!normalized.length) return [];

  const partyBuckets = new Map();
  const soloGroups = [];

  normalized.forEach(candidate => {
    const role = normalizeRoleLabel(candidate.role);
    if (!role) return;

    const member = normaliseQueueMember(candidate);
    if (!member) return;

    const partyKey = normalizePartyKey(candidate.partyKey);

    if (partyKey) {
      const composite = `${role}::${partyKey}`;
      if (!partyBuckets.has(composite)) {
        partyBuckets.set(composite, []);
      }
      partyBuckets.get(composite).push({
        member,
        joinedAt: candidate.joinedAt,
        score: candidate.score,
      });
      return;
    }

    const group = materialiseGroup({
      role,
      members: [member],
      partyKey: null,
      joinedAt: candidate.joinedAt,
      score: candidate.score,
      groupKey: candidate.groupKey || buildSoloGroupKey(member),
    });
    if (group) {
      soloGroups.push(group);
    }
  });

  const partyGroups = [];
  for (const [composite, items] of partyBuckets.entries()) {
    const [roleName, partyKey] = composite.split('::');
    const role = normalizeRoleLabel(roleName);
    if (!role) continue;
    const sorted = items.slice().sort((a, b) => a.joinedAt - b.joinedAt);
    const members = sorted.map(item => item.member);
    const score = averageScore(sorted.map(item => item.score));
    const joinedAt = sorted[0]?.joinedAt ?? Number.MAX_SAFE_INTEGER;
    const group = materialiseGroup({
      role,
      members,
      partyKey,
      joinedAt,
      score,
      groupKey: `party:${partyKey || role}`,
    });
    if (group) {
      partyGroups.push(group);
    }
  }

  const groups = soloGroups.concat(partyGroups);
  groups.sort((a, b) => a.joinedAt - b.joinedAt);
  return groups;
}

function buildRolePools({ template, groups }) {
  const pools = new Map();
  const skipped = [];
  if (!template || !Array.isArray(groups)) {
    return { pools, skipped };
  }

  template.roles.forEach((meta, roleName) => {
    pools.set(roleName, {
      capacity: Number(meta?.capacity) || 0,
      groups: [],
    });
  });

  groups.forEach(group => {
    if (!group) return;
    const entry = pools.get(group.role);
    if (!entry) {
      skipped.push({ group, reason: 'unsupported_role' });
      return;
    }
    if (group.size > entry.capacity) {
      skipped.push({ group, reason: 'insufficient_role_slots' });
      return;
    }
    entry.groups.push(group);
  });

  pools.forEach(entry => {
    entry.groups.sort((a, b) => a.joinedAt - b.joinedAt);
  });

  return { pools, skipped };
}

function hasRemainingRoleGroups(pools) {
  if (!pools) return false;
  for (const entry of pools.values()) {
    if (entry && Array.isArray(entry.groups) && entry.groups.length) {
      return true;
    }
  }
  return false;
}

function allocateRoomsFromPools({ template, rolePools, maxWindowAllowed }) {
  const rooms = [];
  const leftover = [];
  if (!template || !rolePools || !hasRemainingRoleGroups(rolePools)) {
    return { rooms, unplaced: leftover };
  }

  while (hasRemainingRoleGroups(rolePools)) {
    const room = createRoomFromTemplate(template);
    let placedAny = false;

    for (const [roleName, meta] of template.roles.entries()) {
      const pool = rolePools.get(roleName);
      if (!pool || !Array.isArray(pool.groups) || !pool.groups.length) {
        continue;
      }

      let remaining = Number(meta?.capacity) || 0;
      while (remaining > 0 && pool.groups.length) {
        const placedGroup = pickCandidateForRole({
          pool,
          room,
          template,
          maxWindowAllowed,
        });

        if (!placedGroup) {
          break;
        }

        remaining -= placedGroup.size;
        placedAny = true;
      }
    }

    if (!placedAny) {
      break;
    }

    finalizeRoom(room);
    rooms.push(room);
  }

  for (const [roleName, entry] of rolePools.entries()) {
    if (!entry || !Array.isArray(entry.groups)) continue;
    entry.groups.forEach(group => {
      leftover.push({ group, reason: 'conflict', role: roleName });
    });
  }

  return { rooms, unplaced: leftover };
}

function pickCandidateForRole({ pool, room, template, maxWindowAllowed }) {
  if (!pool || !Array.isArray(pool.groups) || pool.groups.length === 0) {
    return null;
  }

  for (let index = 0; index < pool.groups.length; index += 1) {
    const candidate = pool.groups[index];
    if (!candidate) continue;
    const placed = assignGroupToRoom({
      room,
      group: candidate,
      template,
      maxWindowAllowed,
    });
    if (!placed) {
      continue;
    }
    pool.groups.splice(index, 1);
    return candidate;
  }

  return null;
}

function normalizePartyKey(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  return null;
}

function normaliseQueueMember(candidate) {
  const entry = candidate?.entry;
  if (!entry || typeof entry !== 'object') return null;

  const role = normalizeRoleLabel(candidate.role);
  if (!role) return null;

  const ownerId = normalizeOwnerId(
    entry.owner_id ?? entry.ownerId ?? entry.user_id ?? entry.userId
  );
  const heroId = normalizeHeroId(entry.hero_id ?? entry.heroId ?? entry.hero?.id);
  // ownerId may legitimately be null for simulated/anonymous queue entries.
  // Require heroId (or a fallback like ownerId) but allow ownerId to be absent.
  if (!heroId && !ownerId) {
    return null;
  }

  const id = normalizeQueueId(entry.id ?? entry.queue_id ?? entry.queueId);
  const joinedAtIso = normalizeJoinedAt(entry.joined_at ?? entry.joinedAt ?? candidate.joinedAt);
  const score = Number.isFinite(candidate.score) ? Number(candidate.score) : FALLBACK_SCORE;
  const partyKey = normalizePartyKey(candidate.partyKey);

  const clone = { ...entry };
  if (id != null) {
    clone.id = id;
    clone.queue_id = id;
    clone.queueId = id;
  }
  clone.owner_id = ownerId;
  clone.ownerId = ownerId;
  clone.hero_id = heroId;
  clone.heroId = heroId;
  clone.role = role;
  clone.joined_at = joinedAtIso;
  clone.joinedAt = joinedAtIso;
  clone.score = score;
  clone.rating = score;
  if (partyKey) {
    clone.party_key = partyKey;
    clone.partyKey = partyKey;
  }

  if (Array.isArray(candidate?.heroIds) && candidate.heroIds.length) {
    clone.heroIds = candidate.heroIds.map(id => (id == null ? id : String(id)));
  } else if (heroId) {
    clone.heroIds = [heroId];
  }

  return clone;
}

function normalizeOwnerId(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  return null;
}

function normalizeHeroId(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  return null;
}

function normalizeQueueId(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  return null;
}

function normalizeJoinedAt(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
    return value.trim();
  }
  if (Number.isFinite(value)) {
    try {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    } catch {}
  }
  return new Date().toISOString();
}

function buildSoloGroupKey(member) {
  if (!member) return `solo:${Math.random().toString(36).slice(2)}`;
  const ownerId = member.owner_id || member.ownerId || 'owner';
  const heroId = member.hero_id || member.heroId || 'hero';
  return `solo:${ownerId}:${heroId}`;
}

function materialiseGroup({ role, members, partyKey, joinedAt, score, groupKey }) {
  if (!Array.isArray(members) || members.length === 0) return null;
  const normalizedMembers = members.map((member, index) => cloneMemberForRoom(member, index));
  const heroIds = collectGroupHeroIds(normalizedMembers);
  if (!heroIds.length) return null;
  const ownerIds = collectGroupOwnerIds(normalizedMembers);
  const groupScore = Number.isFinite(score)
    ? Number(score)
    : averageScore(normalizedMembers.map(m => m.score));
  const normalizedJoinedAt = Number.isFinite(joinedAt)
    ? joinedAt
    : Date.parse(normalizedMembers[0]?.joined_at || normalizedMembers[0]?.joinedAt || Date.now());

  return {
    role,
    members: normalizedMembers,
    partyKey: partyKey || null,
    groupKey: groupKey || null,
    heroIds,
    ownerIds,
    size: normalizedMembers.length,
    score: Number.isFinite(groupScore) ? groupScore : FALLBACK_SCORE,
    joinedAt: Number.isFinite(normalizedJoinedAt) ? normalizedJoinedAt : Date.now(),
  };
}

function cloneMemberForRoom(member, memberIndex = 0) {
  if (!member || typeof member !== 'object') return null;
  const clone = { ...member };
  if (memberIndex != null && !Number.isNaN(Number(memberIndex))) {
    clone.memberIndex = Number(memberIndex);
  }
  if (!clone.joined_at && clone.joinedAt) {
    clone.joined_at = clone.joinedAt;
  }
  if (!clone.joinedAt && clone.joined_at) {
    clone.joinedAt = clone.joined_at;
  }
  if (clone.score == null && Number.isFinite(Number(clone.rating))) {
    clone.score = Number(clone.rating);
  }
  if (clone.rating == null && Number.isFinite(Number(clone.score))) {
    clone.rating = Number(clone.score);
  }
  return clone;
}

function averageScore(values = []) {
  const filtered = values.map(value => Number(value)).filter(value => Number.isFinite(value));
  if (!filtered.length) return FALLBACK_SCORE;
  const sum = filtered.reduce((acc, value) => acc + value, 0);
  return Math.round(sum / filtered.length);
}

function collectGroupOwnerIds(members = []) {
  const owners = new Set();
  members.forEach(member => {
    const ownerId = normalizeOwnerId(member?.owner_id ?? member?.ownerId);
    if (ownerId) {
      owners.add(ownerId);
    }
  });
  return Array.from(owners);
}

function findCompatibleRoom({ rooms, group, template, maxWindowAllowed }) {
  if (!Array.isArray(rooms) || rooms.length === 0) return null;
  const candidates = [];
  const groupScore = Number.isFinite(group.score) ? Number(group.score) : FALLBACK_SCORE;

  rooms.forEach(room => {
    if (!roomHasRoleCapacity(room, group.role, group.size)) return;
    if (hasRoomHeroConflict(room, group)) return;
    if (hasRoomOwnerConflict(room, group)) return;

    const anchorScore = room.anchorScore ?? groupScore;
    const gap = Math.abs(groupScore - anchorScore);
    if (room.anchorScore != null && gap > maxWindowAllowed) return;

    candidates.push({
      room,
      gap,
    });
  });

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (a.gap !== b.gap) return a.gap - b.gap;
    if (a.room.filledSlots !== b.room.filledSlots) return b.room.filledSlots - a.room.filledSlots;
    return a.room.createdAt - b.room.createdAt;
  });

  return candidates[0]?.room || null;
}

function roomHasRoleCapacity(room, role, needed) {
  if (!room || !role) return false;
  let available = 0;
  room.slots.forEach(slot => {
    if (slot.role !== role) return;
    if (!slot.member) {
      available += 1;
    }
  });
  return available >= needed;
}

function hasRoomHeroConflict(room, group) {
  if (!room || !group) return false;
  return group.heroIds.some(heroId => heroId && room.heroIds.has(heroId));
}

function hasRoomOwnerConflict(room, group) {
  if (!room || !group) return false;
  return group.ownerIds.some(ownerId => ownerId && room.ownerIds.has(ownerId));
}

function createRoomFromTemplate(template) {
  const slots = template.slots.map(slot => ({
    role: slot.role,
    slotIndex: slot.slotIndex,
    member: null,
    groupKey: null,
    partyKey: null,
    occupied: false,
  }));

  return {
    id: nextRoomId(),
    signature: template.signature,
    slots,
    filledSlots: 0,
    ownerIds: new Set(),
    heroIds: new Set(),
    createdAt: Date.now(),
    anchorScore: null,
    totalScore: 0,
    groupCount: 0,
    maxScoreGap: 0,
    roleAnchors: new Map(),
    roleMaxGaps: new Map(),
    groups: [],
  };
}

function assignGroupToRoom({ room, group, template, maxWindowAllowed }) {
  if (!room || !group) return false;
  if (!roomHasRoleCapacity(room, group.role, group.size)) {
    return false;
  }

  const groupScore = Number.isFinite(group.score) ? Number(group.score) : FALLBACK_SCORE;

  const hasExistingGroups = room.groupCount > 0;
  const roomAnchor = hasExistingGroups
    ? Number.isFinite(room.anchorScore)
      ? Number(room.anchorScore)
      : room.groupCount > 0
        ? room.totalScore / room.groupCount
        : null
    : null;

  let gapToRoomBeforePlacement = 0;
  if (hasExistingGroups && Number.isFinite(roomAnchor)) {
    gapToRoomBeforePlacement = Math.abs(groupScore - roomAnchor);
    if (gapToRoomBeforePlacement > maxWindowAllowed) {
      return false;
    }
  }

  const roleAnchor = room.roleAnchors.get(group.role);
  if (roleAnchor != null) {
    const gap = Math.abs(groupScore - roleAnchor);
    if (gap > maxWindowAllowed) {
      return false;
    }
  }

  if (hasRoomHeroConflict(room, group) || hasRoomOwnerConflict(room, group)) {
    return false;
  }

  const openSlots = room.slots.filter(slot => slot.role === group.role && !slot.member);
  if (openSlots.length < group.size) {
    return false;
  }

  const slotIndices = [];
  group.members.forEach((member, index) => {
    const slot = openSlots[index];
    if (!slot) return;
    const clone = cloneMemberForRoom(member, index);
    slot.member = clone;
    slot.groupKey = group.groupKey || null;
    slot.partyKey = group.partyKey || null;
    slot.occupied = true;
    slotIndices.push(slot.slotIndex);

    const heroId = clone.hero_id || clone.heroId || null;
    if (heroId) {
      room.heroIds.add(heroId);
    }
    const ownerId = clone.owner_id || clone.ownerId || null;
    if (ownerId) {
      room.ownerIds.add(ownerId);
    }
  });

  room.filledSlots += group.size;
  room.groupCount += 1;
  room.totalScore += groupScore;
  const anchorAverage = room.totalScore / room.groupCount;
  if (Number.isFinite(anchorAverage)) {
    room.anchorScore = anchorAverage;
  } else if (room.anchorScore == null) {
    room.anchorScore = groupScore;
  }
  if (!room.roleAnchors.has(group.role)) {
    room.roleAnchors.set(group.role, groupScore);
  }
  const roleAnchorScore = room.roleAnchors.get(group.role);
  const gap = Math.abs(groupScore - roleAnchorScore);
  const existingRoleGap = room.roleMaxGaps.get(group.role) || 0;
  if (gap > existingRoleGap) {
    room.roleMaxGaps.set(group.role, gap);
  }
  const gapToRoom =
    room.groupCount > 1 && Number.isFinite(room.anchorScore)
      ? Math.max(gapToRoomBeforePlacement, Math.abs(groupScore - room.anchorScore))
      : gap;
  if (gapToRoom > room.maxScoreGap) {
    room.maxScoreGap = gapToRoom;
  }
  if (group.joinedAt && group.joinedAt < room.createdAt) {
    room.createdAt = group.joinedAt;
  }

  room.groups.push({
    role: group.role,
    groupKey: group.groupKey || null,
    partyKey: group.partyKey || null,
    size: group.size,
    score: groupScore,
    joinedAt: group.joinedAt,
    slotIndices,
    members: group.members.map((member, index) => cloneMemberForRoom(member, index)),
  });

  return true;
}

function finalizeRoom(room) {
  if (!room) return;
  const totalSlots = room.slots.length;
  room.missingSlots = Math.max(0, totalSlots - room.filledSlots);
  room.ready = totalSlots > 0 && room.missingSlots === 0;
}

function buildRoomAssignment(room, template) {
  const roleSlots = room.slots.map(slot => {
    const meta = template.roles.get(slot.role) || { offset: 0 };
    const localIndex = slot.slotIndex;
    const globalIndex = Number.isInteger(meta.offset)
      ? Number(meta.offset) + Number(localIndex)
      : Number(localIndex);
    return {
      role: slot.role,
      slotIndex: Number.isFinite(globalIndex) ? globalIndex : localIndex,
      localIndex,
      occupied: Boolean(slot.member),
      members: slot.member ? [slot.member] : [],
      member: slot.member ? { ...slot.member } : null,
      groupKey: slot.groupKey || null,
      partyKey: slot.partyKey || null,
    };
  });

  const members = [];
  roleSlots.forEach(slot => {
    if (!Array.isArray(slot.members)) return;
    slot.members.forEach(member => {
      if (member) {
        members.push(member);
      }
    });
  });

  const roleLabel = buildRoomLabel(template);

  return {
    role: roleLabel,
    roomId: room.id,
    slots: room.slots.length,
    filledSlots: room.filledSlots,
    missingSlots: room.missingSlots,
    ready: room.ready,
    roleSlots,
    members,
    groups: room.groups.map(group => ({
      role: group.role,
      groupKey: group.groupKey,
      partyKey: group.partyKey,
      size: group.size,
      slotIndices: group.slotIndices,
      score: group.score,
      joinedAt: group.joinedAt,
    })),
    anchorScore: room.anchorScore,
    maxWindow: room.maxScoreGap,
  };
}

function serializeRoom(room, template) {
  return {
    id: room.id,
    ready: room.ready,
    filledSlots: room.filledSlots,
    missingSlots: room.missingSlots,
    totalSlots: room.slots.length,
    anchorScore: room.anchorScore,
    maxScoreGap: room.maxScoreGap,
    label: buildRoomLabel(template),
    slots: room.slots.map(slot => {
      const meta = template.roles.get(slot.role) || { offset: 0 };
      const localIndex = slot.slotIndex;
      const globalIndex = Number.isInteger(meta.offset)
        ? Number(meta.offset) + Number(localIndex)
        : Number(localIndex);
      return {
        role: slot.role,
        slotIndex: Number.isFinite(globalIndex) ? globalIndex : localIndex,
        localIndex,
        occupied: Boolean(slot.member),
        member: slot.member ? { ...slot.member } : null,
        groupKey: slot.groupKey || null,
        partyKey: slot.partyKey || null,
      };
    }),
    groups: room.groups.map(group => ({
      role: group.role,
      groupKey: group.groupKey,
      partyKey: group.partyKey,
      size: group.size,
      slotIndices: group.slotIndices,
      score: group.score,
      joinedAt: group.joinedAt,
    })),
  };
}

function buildRoomLabel(template) {
  if (!template || !template.roles) return '룸';
  const parts = [];
  for (const [roleName, meta] of template.roles.entries()) {
    const capacity = Number(meta?.capacity);
    if (!roleName || capacity <= 0) continue;
    parts.push(capacity > 1 ? `${roleName} x${capacity}` : roleName);
  }
  if (!parts.length) return '룸';
  return parts.join(' · ');
}

function matchCasualParticipants({ roles = [], queue = [], partySize = 1 } = {}) {
  const normalizedRoles = normalizeRoles(roles);
  const totalSlots = countTotalSlots(normalizedRoles);
  if (totalSlots === 0) {
    return buildResult({
      ready: false,
      totalSlots,
      error: { type: 'no_active_slots' },
    });
  }

  const buckets = buildRoleBuckets(queue, partySize);
  const usedGroupKeys = new Set();
  const usedHeroIds = new Set();
  const assignments = [];

  for (const role of normalizedRoles) {
    const resolution = resolveCasualRole({
      role,
      buckets,
      partySize,
      usedGroupKeys,
      usedHeroIds,
    });

    if (!resolution.ok) {
      return buildResult({
        ready: false,
        assignments: assignments.concat(resolution.partialAssignments ?? []),
        totalSlots,
        error: {
          type: resolution.reason,
          role: role.name,
          missing: resolution.missing,
        },
      });
    }

    for (const assignment of resolution.assignments) {
      assignments.push(assignment);
      usedGroupKeys.add(assignment.groupKey);
      appendHeroIds(usedHeroIds, assignment.heroIds);
    }
  }

  const assignedSlots = assignments.reduce((acc, item) => acc + item.slots, 0);
  return buildResult({
    ready: assignedSlots >= totalSlots,
    assignments,
    totalSlots,
    maxWindow: 0,
  });
}

// ---------------------------------------------------------------------------
// Shared rank room helpers
// ---------------------------------------------------------------------------

function resolveRoleWithRooms({ role, groups, scoreWindows, usedGroupKeys, usedHeroIds }) {
  const slotCount = Number(role?.slotCount) || 0;
  const candidates = Array.isArray(groups) ? groups.slice() : [];
  if (slotCount <= 0) {
    return {
      ok: false,
      reason: 'no_active_slots',
      missing: 0,
      partialAssignments: [],
      partialRooms: [],
    };
  }

  const filtered = candidates
    .filter(group => {
      if (!group) return false;
      if (usedGroupKeys.has(group.groupKey)) return false;
      if (hasHeroConflict(group.heroIds, usedHeroIds)) return false;
      const size = getGroupSize(group);
      if (size <= 0) return false;
      return true;
    })
    .sort((a, b) => a.joinedAt - b.joinedAt);

  if (filtered.length === 0) {
    return { ok: false, reason: 'no_candidates', missing: slotCount };
  }

  const windows = normalizeWindows(scoreWindows);
  let best = null;

  for (let index = 0; index < filtered.length; index += 1) {
    const anchor = filtered[index];
    const anchorSize = getGroupSize(anchor);
    if (anchorSize > slotCount) continue;

    for (const window of windows) {
      const attempt = assembleRoomForRole({
        anchor,
        candidates: filtered,
        slotCount,
        window,
        usedHeroIds,
      });

      if (!attempt) continue;
      if (!best || isBetterRoom(attempt, best)) {
        best = attempt;
        if (attempt.ready) break;
      }
    }

    if (best?.ready) {
      break;
    }
  }

  if (!best) {
    return {
      ok: false,
      reason: 'insufficient_candidates',
      missing: slotCount,
    };
  }

  const assignment = createAssignmentFromGroups({ role, picks: best.picks, window: best.window });
  const room = createRoomDescriptor({ role, picks: best.picks, window: best.window });

  return {
    ok: true,
    assignment,
    room,
    window: best.window,
    heroIds: best.heroIds,
    ready: best.ready,
  };
}

function resolveCasualRole({ role, buckets, partySize, usedGroupKeys, usedHeroIds }) {
  const available = getAvailableGroupsForRole({ role, buckets, usedGroupKeys, usedHeroIds });
  if (available.length === 0) {
    return { ok: false, reason: 'no_candidates', missing: role.slotCount };
  }

  const picks = [];
  let slotsRemaining = role.slotCount;
  const localHeroIds = new Set();

  for (const group of available) {
    if (hasHeroConflict(group.heroIds, usedHeroIds, localHeroIds)) {
      continue;
    }
    if (slotsRemaining < group.members.length) {
      continue;
    }

    picks.push(group);
    slotsRemaining -= group.members.length;
    appendHeroIds(localHeroIds, group.heroIds);

    if (slotsRemaining === 0) {
      return {
        ok: true,
        assignments: materializeAssignments({ role, picks }),
      };
    }
  }

  return {
    ok: false,
    reason: 'insufficient_candidates',
    missing: slotsRemaining,
    partialAssignments: materializeAssignments({ role, picks }),
  };
}

function tryPickRankGroups({
  anchor,
  anchorIndex,
  available,
  groupsNeeded,
  role,
  windows,
  usedHeroIds,
}) {
  const picks = [anchor];
  let slotsRemaining = role.slotCount - anchor.members.length;
  if (slotsRemaining < 0) {
    return { ok: false };
  }

  const localHeroIds = new Set(anchor.heroIds || []);
  if (hasHeroConflict(anchor.heroIds, usedHeroIds)) {
    return { ok: false };
  }

  if (slotsRemaining === 0) {
    return { ok: true, groups: picks, window: 0 };
  }

  const pool = available.filter((_, index) => index !== anchorIndex);

  const pickedKeys = new Set([anchor.groupKey]);
  let bestWindow = 0;

  for (const window of windows) {
    for (const group of pool) {
      if (pickedKeys.has(group.groupKey)) continue;
      if (Math.abs(group.score - anchor.score) > window) continue;
      if (slotsRemaining < group.members.length) continue;
      if (hasHeroConflict(group.heroIds, usedHeroIds, localHeroIds)) continue;

      picks.push(group);
      pickedKeys.add(group.groupKey);
      slotsRemaining -= group.members.length;
      if (window > bestWindow) bestWindow = window;
      appendHeroIds(localHeroIds, group.heroIds);

      if (slotsRemaining === 0) {
        return { ok: true, groups: picks, window: bestWindow };
      }

      if (picks.length === groupsNeeded) {
        if (slotsRemaining === 0) {
          return { ok: true, groups: picks, window: bestWindow };
        }
      }
    }
  }

  return { ok: false };
}

function materializeAssignments({ role, picks }) {
  const assignments = [];
  let slotCursor = 0;

  for (const group of picks) {
    assignments.push({
      role: role.name,
      slots: group.members.length,
      roleSlots: buildRoleSlotRange(role.slotCount, slotCursor, group.members.length),
      members: group.members.map(candidate => candidate.entry),
      groupKey: group.groupKey,
      partyKey: group.partyKey ?? null,
      anchorScore: group.score,
      joinedAt: group.joinedAt,
      heroIds: Array.isArray(group.heroIds) ? group.heroIds.slice() : [],
    });
    slotCursor += group.members.length;
  }

  return assignments;
}

function buildRoleSlotRange(totalSlots, start, count) {
  const indices = [];
  for (let index = 0; index < count; index += 1) {
    if (start + index >= totalSlots) break;
    indices.push(start + index);
  }
  return indices;
}

function getAvailableGroupsForRole({ role, buckets, usedGroupKeys, usedHeroIds }) {
  const bucket = buckets.get(role.name);
  if (!bucket) return [];
  return bucket.filter(group => {
    if (usedGroupKeys.has(group.groupKey)) return false;
    if (hasHeroConflict(group.heroIds, usedHeroIds)) return false;
    return true;
  });
}

function buildMixedRoleGroups(queue) {
  const normalized = normalizeQueue(queue);
  const perRole = new Map();
  const partyBuckets = new Map();

  for (const candidate of normalized) {
    if (!candidate.role) continue;
    if (candidate.partyKey) {
      const composite = `${candidate.role}::${candidate.partyKey}`;
      if (!partyBuckets.has(composite)) {
        partyBuckets.set(composite, []);
      }
      partyBuckets.get(composite).push(candidate);
      continue;
    }

    const soloGroup = {
      role: candidate.role,
      members: [candidate],
      size: 1,
      score: candidate.score,
      joinedAt: candidate.joinedAt,
      groupKey: candidate.groupKey,
      partyKey: null,
      heroIds: candidate.heroIds || [],
    };
    pushGroup(perRole, candidate.role, soloGroup);
  }

  for (const [composite, members] of partyBuckets.entries()) {
    const [roleName, partyKey] = composite.split('::');
    if (!roleName) continue;
    const sortedMembers = members.slice().sort((a, b) => a.joinedAt - b.joinedAt);
    const averageScore = Math.round(
      sortedMembers.reduce((acc, candidate) => acc + candidate.score, 0) / sortedMembers.length
    );
    const partyGroup = {
      role: roleName,
      members: sortedMembers,
      size: sortedMembers.length,
      score: averageScore,
      joinedAt: sortedMembers[0]?.joinedAt ?? Number.MAX_SAFE_INTEGER,
      groupKey: `party:${partyKey}`,
      partyKey,
      heroIds: collectGroupHeroIds(sortedMembers),
    };
    pushGroup(perRole, roleName, partyGroup);
  }

  for (const [, groups] of perRole.entries()) {
    groups.sort((a, b) => a.joinedAt - b.joinedAt);
  }

  return perRole;
}

function assembleRoomForRole({ anchor, candidates, slotCount, window, usedHeroIds }) {
  if (!anchor) return null;
  const anchorSize = getGroupSize(anchor);
  if (anchorSize <= 0 || anchorSize > slotCount) {
    return null;
  }

  const normalizedWindow = Number(window) || 0;
  const heroSet = new Set();
  appendHeroIds(heroSet, anchor.heroIds);
  const picks = [anchor];
  let best = createRoomCandidate({ picks, heroSet, slotCount, window: normalizedWindow });

  const others = candidates
    .filter(group => group && group.groupKey !== anchor.groupKey)
    .sort((a, b) => a.joinedAt - b.joinedAt);

  function dfs(startIndex, occupantCount) {
    const candidateState = createRoomCandidate({
      picks,
      heroSet,
      slotCount,
      window: normalizedWindow,
    });

    if (!best || isBetterRoom(candidateState, best)) {
      best = candidateState;
    }

    if (occupantCount >= slotCount) {
      return;
    }

    for (let index = startIndex; index < others.length; index += 1) {
      const group = others[index];
      const size = getGroupSize(group);
      if (size <= 0 || occupantCount + size > slotCount) continue;

      const scoreGap = Math.abs((group.score ?? FALLBACK_SCORE) - (anchor.score ?? FALLBACK_SCORE));
      if (scoreGap > normalizedWindow) continue;
      if (hasHeroConflict(group.heroIds, heroSet, usedHeroIds)) continue;

      picks.push(group);
      const added = addHeroIds(heroSet, group.heroIds);
      dfs(index + 1, occupantCount + size);
      picks.pop();
      removeHeroIds(heroSet, added);
    }
  }

  dfs(0, anchorSize);

  return best;
}

function createRoomCandidate({ picks, heroSet, slotCount, window }) {
  const occupantCount = picks.reduce((acc, group) => acc + getGroupSize(group), 0);
  const ready = slotCount > 0 && occupantCount >= slotCount;
  const latestJoin = picks.reduce((acc, group) => Math.max(acc, group.joinedAt ?? 0), 0);
  return {
    picks: picks.slice(),
    heroIds: Array.from(heroSet),
    occupantCount,
    ready,
    window,
    latestJoin,
  };
}

function isBetterRoom(candidate, current) {
  if (!current) return true;
  if (candidate.ready && !current.ready) return true;
  if (!candidate.ready && current.ready) return false;
  if (candidate.occupantCount > current.occupantCount) return true;
  if (candidate.occupantCount < current.occupantCount) return false;
  if (candidate.latestJoin < current.latestJoin) return true;
  if (candidate.latestJoin > current.latestJoin) return false;
  return candidate.window < current.window;
}

function createAssignmentFromGroups({ role, picks, window }) {
  const slotCount = Number(role?.slotCount) || 0;
  const members = [];
  const groups = [];
  let filled = 0;

  picks.forEach(group => {
    const size = getGroupSize(group);
    filled += size;
    groups.push({
      groupKey: group.groupKey,
      partyKey: group.partyKey ?? null,
      size,
      score: group.score,
      joinedAt: group.joinedAt,
      heroIds: Array.isArray(group.heroIds) ? group.heroIds.slice() : [],
    });
    group.members.forEach(candidate => {
      members.push(candidate.entry || candidate);
    });
  });

  const missing = Math.max(0, slotCount - filled);

  return {
    role: role.name,
    slots: slotCount,
    filledSlots: Math.min(filled, slotCount),
    missingSlots: missing,
    ready: missing === 0 && slotCount > 0,
    window,
    members,
    groups,
    roomKey: buildRoomKey(role.name, picks),
    anchorScore: picks[0]?.score ?? null,
  };
}

function createRoomDescriptor({ role, picks, window }) {
  const slotCount = Number(role?.slotCount) || 0;
  const members = [];
  const groups = [];
  let filled = 0;

  picks.forEach(group => {
    const size = getGroupSize(group);
    filled += size;
    groups.push({
      groupKey: group.groupKey,
      partyKey: group.partyKey ?? null,
      size,
      score: group.score,
      joinedAt: group.joinedAt,
      heroIds: Array.isArray(group.heroIds) ? group.heroIds.slice() : [],
    });
    group.members.forEach(candidate => {
      members.push(candidate.entry || candidate);
    });
  });

  const missing = Math.max(0, slotCount - filled);

  return {
    role: role.name,
    slotCount,
    filledSlots: Math.min(filled, slotCount),
    missingSlots: missing,
    ready: missing === 0 && slotCount > 0,
    window,
    members,
    groups,
    roomKey: buildRoomKey(role.name, picks),
    anchorScore: picks[0]?.score ?? null,
  };
}

function buildRoomKey(roleName, picks = []) {
  const anchor = picks[0];
  const baseKey = anchor?.groupKey || anchor?.partyKey || 'solo';
  const joinedAt = anchor?.joinedAt ?? Date.now();
  return `${roleName || 'role'}::${baseKey}::${joinedAt}`;
}

function addHeroIds(targetSet, heroIds = []) {
  const added = [];
  if (!targetSet || typeof targetSet.add !== 'function') return added;
  if (!Array.isArray(heroIds)) return added;
  heroIds.forEach(id => {
    if (!id) return;
    if (!targetSet.has(id)) {
      targetSet.add(id);
      added.push(id);
    }
  });
  return added;
}

function removeHeroIds(targetSet, heroIds = []) {
  if (!targetSet || typeof targetSet.delete !== 'function') return;
  heroIds.forEach(id => {
    targetSet.delete(id);
  });
}

function getGroupSize(group) {
  if (!group) return 0;
  const numeric = Number(group.size);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  if (Array.isArray(group.members)) {
    return group.members.length;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeRoles(rawRoles) {
  if (!Array.isArray(rawRoles)) return [];
  const result = [];

  for (const raw of rawRoles) {
    if (!raw) continue;
    const name = typeof raw === 'string' ? raw : (raw.name ?? raw.role);
    const slotCount = coerceInteger(
      typeof raw === 'number' ? raw : (raw.slot_count ?? raw.slotCount ?? raw.slots),
      0
    );

    if (!name || slotCount <= 0) continue;
    result.push({ name, slotCount });
  }

  return result;
}

function normalizeWindows(windows) {
  if (!Array.isArray(windows) || windows.length === 0) {
    return DEFAULT_SCORE_WINDOWS;
  }
  return windows
    .map(value => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) return 0;
      return parsed;
    })
    .sort((a, b) => a - b);
}

function countTotalSlots(roles) {
  return roles.reduce((acc, role) => acc + role.slotCount, 0);
}

function buildRoleBuckets(queue, partySize) {
  const normalizedQueue = normalizeQueue(queue);
  const perRole = new Map();

  if (partySize > 1) {
    appendPartyBuckets(perRole, normalizedQueue, partySize);
  } else {
    for (const candidate of normalizedQueue) {
      if (!candidate.role) continue;
      const key = candidate.groupKey;
      const group = {
        role: candidate.role,
        score: candidate.score,
        joinedAt: candidate.joinedAt,
        members: [candidate],
        groupKey: key,
        partyKey: candidate.partyKey ?? null,
        heroIds: candidate.heroIds || [],
      };
      pushGroup(perRole, candidate.role, group);
    }
  }

  for (const [, groups] of perRole) {
    groups.sort((a, b) => a.joinedAt - b.joinedAt);
  }

  return perRole;
}

function appendPartyBuckets(perRole, candidates, partySize) {
  const byParty = new Map();

  for (const candidate of candidates) {
    if (!candidate.role) continue;
    if (!candidate.partyKey) continue;

    const composite = `${candidate.role}::${candidate.partyKey}`;
    if (!byParty.has(composite)) {
      byParty.set(composite, []);
    }
    byParty.get(composite).push(candidate);
  }

  for (const [composite, members] of byParty.entries()) {
    const [roleName, partyKey] = composite.split('::');
    if (!roleName) continue;

    members.sort((a, b) => a.joinedAt - b.joinedAt);

    for (let index = 0; index + partySize <= members.length; index += partySize) {
      const slice = members.slice(index, index + partySize);
      const joinedAt = slice[0].joinedAt;
      const averageScore = Math.round(
        slice.reduce((acc, candidate) => acc + candidate.score, 0) / slice.length
      );

      const group = {
        role: roleName,
        score: averageScore,
        joinedAt,
        members: slice,
        groupKey: `${partyKey}#${index}`,
        partyKey,
        heroIds: collectGroupHeroIds(slice),
      };

      pushGroup(perRole, roleName, group);
    }
  }
}

function pushGroup(map, roleName, group) {
  if (!map.has(roleName)) {
    map.set(roleName, []);
  }
  map.get(roleName).push(group);
}

function normalizeQueue(queue) {
  if (!Array.isArray(queue)) return [];
  const result = [];

  for (const entry of queue) {
    if (!entry) continue;
    if (entry.simulated === true || entry.standin === true) {
      continue;
    }

    const role = entry.role ?? entry.role_name ?? entry.roleName;
    if (!role) continue;

    const score = deriveScore(entry);
    const joinedAt = deriveTimestamp(entry);
    const partyKey = derivePartyKey(entry);
    const groupKey = deriveGroupKey(entry);
    const heroIds = deriveHeroIds(entry);

    result.push({
      role,
      score,
      joinedAt,
      partyKey,
      groupKey,
      heroIds,
      entry,
    });
  }

  result.sort((a, b) => a.joinedAt - b.joinedAt);
  return result;
}

function deriveScore(entry) {
  const keys = ['score', 'rating', 'mmr'];
  for (const key of keys) {
    const value = Number(entry[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return FALLBACK_SCORE;
}

function deriveTimestamp(entry) {
  const keys = ['queue_joined_at', 'joined_at', 'queued_at', 'created_at', 'updated_at'];

  for (const key of keys) {
    const raw = entry[key];
    if (!raw) continue;
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

function derivePartyKey(entry) {
  const keys = ['party_id', 'partyId', 'party_key', 'partyKey', 'duo_party_id'];
  for (const key of keys) {
    const value = entry[key];
    if (value != null) {
      return String(value);
    }
  }
  return null;
}

function deriveGroupKey(entry) {
  if (entry.id != null) return `id:${entry.id}`;

  const heroId = entry.hero_id ?? entry.heroId ?? null;
  const isStandin =
    entry.simulated === true || entry.standin === true || entry.match_source === 'participant_pool';

  if (isStandin && heroId != null) {
    return `hero:${heroId}`;
  }

  if (entry.owner_id != null) return `owner:${entry.owner_id}`;
  if (entry.ownerId != null) return `owner:${entry.ownerId}`;
  if (heroId != null) return `hero:${heroId}`;
  const fallback = Math.random().toString(36).slice(2);
  return `rand:${fallback}`;
}

function deriveHeroIds(entry) {
  const collected = new Set();

  const push = value => {
    if (value === null || value === undefined) return;
    let normalized = value;
    if (typeof normalized === 'string') {
      normalized = normalized.trim();
    }
    if (typeof normalized === 'number') {
      if (!Number.isFinite(normalized)) return;
      normalized = String(normalized);
    }
    if (typeof normalized === 'bigint') {
      normalized = normalized.toString();
    }
    if (typeof normalized !== 'string') {
      normalized = String(normalized);
    }
    if (!normalized) return;
    collected.add(normalized);
  };

  push(entry.hero_id);
  push(entry.heroId);

  const heroIdArrays = [entry.hero_ids, entry.heroIds];
  heroIdArrays.forEach(list => {
    if (!Array.isArray(list)) return;
    list.forEach(value => push(value));
  });

  if (collected.size === 0 && entry.hero && entry.hero.id != null) {
    push(entry.hero.id);
  }

  if (collected.size === 0) {
    const ownerId = entry.owner_id ?? entry.ownerId ?? entry.ownerID ?? entry.owner?.id ?? null;
    if (ownerId != null) {
      push(ownerId);
    }
  }

  return Array.from(collected);
}

function collectGroupHeroIds(members = []) {
  const collected = new Set();
  members.forEach(candidate => {
    appendHeroIds(collected, candidate.heroIds);
  });
  return Array.from(collected);
}

function appendHeroIds(targetSet, heroIds = []) {
  if (!targetSet || typeof targetSet.add !== 'function') return;
  if (!Array.isArray(heroIds)) return;
  heroIds.forEach(id => {
    if (!id) return;
    targetSet.add(id);
  });
}

function hasHeroConflict(heroIds = [], ...sets) {
  if (!Array.isArray(heroIds) || heroIds.length === 0) return false;
  for (const id of heroIds) {
    if (!id) continue;
    for (const set of sets) {
      if (!set) continue;
      if (set.has && set.has(id)) {
        return true;
      }
    }
  }
  return false;
}

function coerceInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

// Try to form a single complete room by recombining groups collected from
// existing partial rooms and unplaced groups. This performs a bounded DFS to
// find a set of groups that exactly fill the template's slot capacities while
// respecting hero/owner conflicts and window constraints. Returns a room
// object (same shape as createRoomFromTemplate) or null if not found.
function tryFormFullRoomFromGroups({ template, rooms, combinedUnplaced, maxWindowAllowed, userRequestedWindow = null }) {
  if (!template || !template.roles) return null;

  // Collect candidate groups from existing rooms and unplaced buckets.
  const candidates = [];
  (rooms || []).forEach(r => {
    if (!Array.isArray(r.groups)) return;
    r.groups.forEach(g => {
      if (!g) return;
      candidates.push({
        role: g.role,
        size: Number(g.size) || (Array.isArray(g.members) ? g.members.length : 0),
        score: g.score ?? 0,
        groupKey: g.groupKey || null,
        partyKey: g.partyKey || null,
        members: Array.isArray(g.members) ? g.members.map(m => ({ ...(m.entry || m), ...m })) : [],
        heroIds: Array.isArray(g.heroIds) ? g.heroIds.slice() : Array.isArray(g.members) ? collectGroupHeroIds(g.members) : [],
        ownerIds: Array.isArray(g.ownerIds) ? g.ownerIds.slice() : [],
        joinedAt: g.joinedAt || Date.now(),
        source: 'room',
      });
    });
  });

  (combinedUnplaced || []).forEach(u => {
    const g = u && (u.group || u);
    if (!g) return;
    candidates.push({
      role: g.role,
      size: Number(g.size) || (Array.isArray(g.members) ? g.members.length : 0),
      score: g.score ?? 0,
      groupKey: g.groupKey || null,
      partyKey: g.partyKey || null,
      members: Array.isArray(g.members) ? g.members.map(m => ({ ...(m.entry || m), ...m })) : [],
      heroIds: Array.isArray(g.heroIds) ? g.heroIds.slice() : Array.isArray(g.members) ? collectGroupHeroIds(g.members) : [],
      ownerIds: Array.isArray(g.ownerIds) ? g.ownerIds.slice() : [],
      joinedAt: g.joinedAt || Date.now(),
      source: 'unplaced',
    });
  });

  // Sort candidates by useful heuristics to prioritize larger, older, lower-score groups
  candidates.sort((a, b) => {
    if ((b.size || 0) !== (a.size || 0)) return (b.size || 0) - (a.size || 0);
    if ((a.joinedAt || 0) !== (b.joinedAt || 0)) return (a.joinedAt || 0) - (b.joinedAt || 0);
    return (a.score || 0) - (b.score || 0);
  });

  // Iterative deepening over candidate-set sizes to keep search bounded while
  // giving the recombiner a chance to find a solution in smaller reduced spaces.
  const MAX_CANDIDATES_GLOBAL = 48;
  if (candidates.length === 0) return null;
  if (candidates.length > MAX_CANDIDATES_GLOBAL) {
    // keep top candidates by heuristic
    candidates = candidates.slice(0, MAX_CANDIDATES_GLOBAL);
  }

  // Quick pairwise (and triple) partial-room merge attempts: often the greedy
  // allocator creates two or three partial rooms that together can form a
  // complete room. Try small combinatorial merges first with a low budget.
  // Cheap greedy merge: try to greedily assemble a room from all available
  // partial-room groups + unplaced groups. This is a deterministic, low-cost
  // pass intended to catch common 2-3 group recombination cases without
  // invoking the heavier DFS. It preserves window semantics by using
  // assignGroupToRoom checks.
  function tryGreedyMerge(partialRoomsList) {
    const combined = [];
    partialRoomsList.forEach(r => {
      r.groups.forEach(g => combined.push({ role: g.role, size: Number(g.size) || (Array.isArray(g.members)?g.members.length:0), score: g.score, groupKey: g.groupKey || null, partyKey: g.partyKey || null, members: Array.isArray(g.members)? g.members.map(m => ({ ...(m.entry || m), ...m })) : [], heroIds: Array.isArray(g.heroIds)? g.heroIds.slice():Array.isArray(g.members)? collectGroupHeroIds(g.members):[], ownerIds: Array.isArray(g.ownerIds)? g.ownerIds.slice():[], joinedAt: g.joinedAt || Date.now(), source: 'room' }));
    });
    (combinedUnplaced || []).forEach(u => {
      const g = u && (u.group || u);
      if (!g) return;
      combined.push({ role: g.role, size: Number(g.size) || (Array.isArray(g.members)?g.members.length:0), score: g.score ?? 0, groupKey: g.groupKey || null, partyKey: g.partyKey || null, members: Array.isArray(g.members)? g.members.map(m => ({ ...(m.entry || m), ...m })) : [], heroIds: Array.isArray(g.heroIds) ? g.heroIds.slice() : Array.isArray(g.members) ? collectGroupHeroIds(g.members) : [], ownerIds: Array.isArray(g.ownerIds) ? g.ownerIds.slice() : [], joinedAt: g.joinedAt || Date.now(), source: 'unplaced' });
    });

    // sort by size desc, joinedAt asc
    combined.sort((a, b) => { if ((b.size||0) !== (a.size||0)) return (b.size||0) - (a.size||0); if ((a.joinedAt||0) !== (b.joinedAt||0)) return (a.joinedAt||0) - (b.joinedAt||0); return (a.score||0) - (b.score||0); });

    // helper to run greedy placement over a given ordering of candidates
    function runGreedy(ordering) {
      const roomLocal = createRoomFromTemplate(template);
      if (process && process.env && process.env.DEBUG_MATCHING === '1') {
        try { console.log('[matching-recombine-debug] tryGreedyMerge attempt ordering', JSON.stringify(ordering.map(c=>({role:c.role,size:c.size,score:c.score,joinedAt:c.joinedAt})))) } catch(e){}
      }
      for (const c of ordering) {
        const group = { role: c.role, members: c.members || [], groupKey: c.groupKey || null, partyKey: c.partyKey || null, size: c.size, score: c.score, joinedAt: c.joinedAt };
        group.heroIds = Array.isArray(c.heroIds) ? c.heroIds.slice() : collectGroupHeroIds(group.members || []);
        group.ownerIds = Array.isArray(c.ownerIds) ? c.ownerIds.slice() : collectGroupOwnerIds(group.members || []);
        // try to place; respect maxWindowAllowed
        const placed = assignGroupToRoom({ room: roomLocal, group, template, maxWindowAllowed });
        if (process && process.env && process.env.DEBUG_MATCHING === '1') {
          try { console.log('[matching-recombine-debug] tryGreedyMerge place', JSON.stringify({ group: { role: group.role, size: group.size, score: group.score }, placed, room: { filledSlots: roomLocal.filledSlots, missingSlots: roomLocal.slots.length - roomLocal.filledSlots, anchorScore: roomLocal.anchorScore, maxScoreGap: roomLocal.maxScoreGap } })); } catch(e){}
        }
        if (!placed) continue;
        if (roomLocal.filledSlots >= roomLocal.slots.length) {
          finalizeRoom(roomLocal);
          return roomLocal.ready ? roomLocal : null;
        }
      }
      return null;
    }

    // first try the natural heuristic ordering
    const firstPass = runGreedy(combined);
    if (firstPass) return firstPass;

    // If greedy failed and the combined set is small, try anchor-first variants:
    // attempt each candidate as the anchor (place it first) and then the rest
    // in the heuristic order. This is cheap for small sets and fixes cases
    // where an early anchor choice blocks valid placements later.
    const ANCHOR_TRY_LIMIT = 6;
    if (combined.length > 0 && combined.length <= ANCHOR_TRY_LIMIT) {
      for (let i = 0; i < combined.length; i += 1) {
        const anchor = combined[i];
        const rest = combined.slice(0, i).concat(combined.slice(i + 1));
        const ordering = [anchor].concat(rest);
        const r = runGreedy(ordering);
        if (r) return r;
      }
    }

    return null;
  }

  const partialRooms = (rooms || []).filter(r => r && r.missingSlots > 0 && Array.isArray(r.groups) && r.groups.length);
  // try cheap greedy merge first
  if (partialRooms.length > 0) {
    const greedy = tryGreedyMerge(partialRooms);
    if (greedy) return greedy;
  }
  const PAIR_BUDGET = 5000;
  // try pairs
  for (let a = 0; a < partialRooms.length; a += 1) {
    for (let b = a + 1; b < partialRooms.length; b += 1) {
      const combined = [];
      partialRooms[a].groups.forEach(g => combined.push({ role: g.role, size: Number(g.size) || (Array.isArray(g.members)?g.members.length:0), score: g.score, groupKey: g.groupKey || null, partyKey: g.partyKey || null, members: Array.isArray(g.members)? g.members.map(m => ({ ...(m.entry || m), ...m })) : [], heroIds: Array.isArray(g.heroIds)? g.heroIds.slice():Array.isArray(g.members)? collectGroupHeroIds(g.members):[], ownerIds: Array.isArray(g.ownerIds)? g.ownerIds.slice():[], joinedAt: g.joinedAt || Date.now() }));
  partialRooms[b].groups.forEach(g => combined.push({ role: g.role, size: Number(g.size) || (Array.isArray(g.members)?g.members.length:0), score: g.score, groupKey: g.groupKey || null, partyKey: g.partyKey || null, members: Array.isArray(g.members)? g.members.map(m => ({ ...(m.entry || m), ...m })) : [], heroIds: Array.isArray(g.heroIds)? g.heroIds.slice():Array.isArray(g.members)? collectGroupHeroIds(g.members):[], ownerIds: Array.isArray(g.ownerIds)? g.ownerIds.slice():[], joinedAt: g.joinedAt || Date.now(), source: 'room' }));
      (combinedUnplaced || []).forEach(u => {
        const g = u && (u.group || u);
        if (!g) return;
        combined.push({ role: g.role, size: Number(g.size) || (Array.isArray(g.members)?g.members.length:0), score: g.score ?? 0, groupKey: g.groupKey || null, partyKey: g.partyKey || null, members: Array.isArray(g.members)? g.members.map(m => ({ ...(m.entry || m), ...m })) : [], heroIds: Array.isArray(g.heroIds) ? g.heroIds.slice() : Array.isArray(g.members) ? collectGroupHeroIds(g.members) : [], ownerIds: Array.isArray(g.ownerIds) ? g.ownerIds.slice() : [], joinedAt: g.joinedAt || Date.now() });
      });
      // small local attempt
      const tryLocal = trySearchWithCandidates(combined, PAIR_BUDGET);
      if (tryLocal) return tryLocal;
    }
  }
  // try triples (if needed) with slightly higher budget
  const TRIPLE_BUDGET = 15000;
  for (let a = 0; a < partialRooms.length; a += 1) {
    for (let b = a + 1; b < partialRooms.length; b += 1) {
      for (let c = b + 1; c < partialRooms.length; c += 1) {
        const combined = [];
        partialRooms[a].groups.forEach(g => combined.push({ role: g.role, size: Number(g.size) || (Array.isArray(g.members)?g.members.length:0), score: g.score, groupKey: g.groupKey || null, partyKey: g.partyKey || null, members: Array.isArray(g.members)? g.members.map(m => ({ ...(m.entry || m), ...m })) : [], heroIds: Array.isArray(g.heroIds)? g.heroIds.slice():Array.isArray(g.members)? collectGroupHeroIds(g.members):[], ownerIds: Array.isArray(g.ownerIds)? g.ownerIds.slice():[], joinedAt: g.joinedAt || Date.now() }));
  partialRooms[b].groups.forEach(g => combined.push({ role: g.role, size: Number(g.size) || (Array.isArray(g.members)?g.members.length:0), score: g.score, groupKey: g.groupKey || null, partyKey: g.partyKey || null, members: Array.isArray(g.members)? g.members.map(m => ({ ...(m.entry || m), ...m })) : [], heroIds: Array.isArray(g.heroIds)? g.heroIds.slice():Array.isArray(g.members)? collectGroupHeroIds(g.members):[], ownerIds: Array.isArray(g.ownerIds)? g.ownerIds.slice():[], joinedAt: g.joinedAt || Date.now(), source: 'room' }));
  partialRooms[c].groups.forEach(g => combined.push({ role: g.role, size: Number(g.size) || (Array.isArray(g.members)?g.members.length:0), score: g.score, groupKey: g.groupKey || null, partyKey: g.partyKey || null, members: Array.isArray(g.members)? g.members.map(m => ({ ...(m.entry || m), ...m })) : [], heroIds: Array.isArray(g.heroIds)? g.heroIds.slice():Array.isArray(g.members)? collectGroupHeroIds(g.members):[], ownerIds: Array.isArray(g.ownerIds)? g.ownerIds.slice():[], joinedAt: g.joinedAt || Date.now(), source: 'room' }));
        (combinedUnplaced || []).forEach(u => {
          const g = u && (u.group || u);
          if (!g) return;
          combined.push({ role: g.role, size: Number(g.size) || (Array.isArray(g.members)?g.members.length:0), score: g.score ?? 0, groupKey: g.groupKey || null, partyKey: g.partyKey || null, members: Array.isArray(g.members)? g.members.map(m => ({ ...(m.entry || m), ...m })) : [], heroIds: Array.isArray(g.heroIds) ? g.heroIds.slice() : Array.isArray(g.members) ? collectGroupHeroIds(g.members) : [], ownerIds: Array.isArray(g.ownerIds) ? g.ownerIds.slice() : [], joinedAt: g.joinedAt || Date.now(), source: 'unplaced' });
        });
        const tryLocal = trySearchWithCandidates(combined, TRIPLE_BUDGET);
        if (tryLocal) return tryLocal;
      }
    }
  }

  // Build remaining slots map from template
  // Quick exhaustive attempt when candidate count is small and total sizes
  // exactly match totalSlots: try all permutations deterministically. This
  // addresses small pathological cases (e.g., three 1-slot groups filling a
  // 3-slot template) where DFS anchoring or pruning may miss a valid
  // arrangement.
  try {
    const smallPermLimit = 8;
    const sumSizesCandidates = candidates.reduce((s, c) => s + (Number(c.size) || 0), 0);
    if (candidates.length > 0 && candidates.length <= smallPermLimit && sumSizesCandidates === Array.from(template.roles.values()).reduce((s, m) => s + (Number(m?.capacity)||0), 0)) {
      // generate permutations using Heap's algorithm over candidate indices
      const perm = [];
      for (let i = 0; i < candidates.length; i += 1) perm.push(i);
      const results = [];
      function heap(n) {
        if (n === 1) { results.push(perm.slice()); return; }
        for (let i = 0; i < n; i += 1) {
          heap(n - 1);
          const j = n % 2 === 0 ? i : 0;
          const tmp = perm[n - 1]; perm[n - 1] = perm[j]; perm[j] = tmp;
        }
      }
      heap(candidates.length);
      for (const ordering of results) {
        const room = createRoomFromTemplate(template);
        let ok = true;
        for (const idx of ordering) {
          const g = candidates[idx];
          const group = { role: g.role, members: g.members || [], groupKey: g.groupKey || null, partyKey: g.partyKey || null, size: g.size, score: g.score, joinedAt: g.joinedAt };
          group.heroIds = Array.isArray(g.heroIds) ? g.heroIds.slice() : collectGroupHeroIds(group.members || []);
          group.ownerIds = Array.isArray(g.ownerIds) ? g.ownerIds.slice() : collectGroupOwnerIds(group.members || []);
          const placed = assignGroupToRoom({ room, group, template, maxWindowAllowed });
          if (!placed) {
            if (process && process.env && process.env.DEBUG_MATCHING === '1') {
              try {
                console.log('[matching-recombine-debug] permutation place failed', JSON.stringify({ group: { role: group.role, size: group.size, score: group.score, joinedAt: group.joinedAt }, room: { filledSlots: room.filledSlots, missingSlots: room.slots.length - room.filledSlots, anchorScore: room.anchorScore, maxScoreGap: room.maxScoreGap }, effectiveMaxWindow }));
              } catch (e) {}
            }
            ok = false; break;
          }
        }
        if (ok) { finalizeRoom(room); if (room.ready) return room; }
      }
    }
  } catch (e) {
    // ignore
  }

  const remaining = new Map();
  let totalSlots = 0;
  for (const [roleName, meta] of template.roles.entries()) {
    const capacity = Number(meta?.capacity) || 0;
    remaining.set(roleName, capacity);
    totalSlots += capacity;
  }
  if (totalSlots === 0) return null;

  // quick prune: sum of candidate sizes must be >= totalSlots
  const sumSizes = candidates.reduce((s, c) => s + (Number(c.size) || 0), 0);
  if (sumSizes < totalSlots) return null;

  // DFS search helper which operates on a given candidate subset.
  function trySearchWithCandidates(localCandidates, maxSteps, baseRemaining, maxWindowOverride) {
    if (process && process.env && process.env.DEBUG_MATCHING === '1') {
      try {
        console.log('[matching-recombine-debug] trySearchWithCandidates start', JSON.stringify({
          candidateCount: localCandidates.length,
          maxSteps: Number(maxSteps) || 0,
          baseRemaining: baseRemaining && typeof baseRemaining.entries === 'function' ? Array.from(baseRemaining.entries()) : null,
        }));
      } catch (e) {}
    }

  const usedLocal = new Array(localCandidates.length).fill(false);
    const heroSetLocal = new Set();
    const ownerSetLocal = new Set();
    let stepsLocal = 0;

  const effectiveMaxWindow = Number.isFinite(maxWindowOverride) ? Number(maxWindowOverride) : maxWindowAllowed;

  // Quick deterministic permutation try for small candidate sets. DFS can
  // miss valid placements due to anchoring order or early pruning in some
  // pathological scoring arrangements. Try all permutations up to a small
  // limit (factorial grows fast) and attempt to place groups in that order.
  // Only attempt permutations when the local candidate set includes at
  // least one group originating from an existing room. We avoid permutation
  // for pure-queue candidate sets because reordering pure queue entries can
  // change strict score-window semantics and cause unintended matches.
    const PERM_LIMIT = 6;
  const hasRoomLocal = localCandidates.some(c => c && c.source === 'room');
    if (localCandidates.length > 0 && localCandidates.length <= PERM_LIMIT && hasRoomLocal) {
      if (process && process.env && process.env.DEBUG_MATCHING === '1') {
        try { console.log('[matching-recombine-debug] trySearchWithCandidates: attempting permutations', { count: localCandidates.length }); } catch (e) {}
      }

      // If the span of candidate scores already exceeds the allowed window
      // there's no point in permuting — any ordering will still violate the
      // configured window. Skip permutations in that case to avoid creating
      // matches that break strict-window semantics.
      const scores = localCandidates.map(c => Number(c && Number.isFinite(Number(c.score)) ? Number(c.score) : 0));
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      // Compute average and maximum deviation from that average. Using the
      // average (room anchor) is a more accurate predictor of whether the
      // candidate set can fit within the window after placement; max-min is
      // overly conservative because anchor can sit between extremes.
      const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / (scores.length || 1));
      const maxDev = Math.max(...scores.map(s => Math.abs(s - avgScore)));
      if (Number.isFinite(minScore) && Number.isFinite(maxScore) && maxDev > effectiveMaxWindow) {
        if (process && process.env && process.env.DEBUG_MATCHING === '1') {
          try { console.log('[matching-recombine-debug] skipping permutations: score span/deviation exceeds window', { minScore, maxScore, span: maxScore - minScore, avgScore, maxDev, window: effectiveMaxWindow }); } catch (e) {}
        }
      } else {

      // generate simple permutations using Heap's algorithm
      const perm = [];
      for (let i = 0; i < localCandidates.length; i += 1) perm.push(i);
      const results = [];

      function heap(n) {
        if (n === 1) {
          results.push(perm.slice());
          return;
        }
        for (let i = 0; i < n; i += 1) {
          heap(n - 1);
          const j = n % 2 === 0 ? i : 0;
          const tmp = perm[n - 1];
          perm[n - 1] = perm[j];
          perm[j] = tmp;
        }
      }

      heap(localCandidates.length);

  for (const ordering of results) {
        const room = createRoomFromTemplate(template);
        let ok = true;
        for (const idx of ordering) {
          const c = localCandidates[idx];
          if (!c) { ok = false; break; }
          const group = {
            role: c.role,
            members: c.members || [],
            groupKey: c.groupKey || null,
            partyKey: c.partyKey || null,
            size: c.size,
            score: c.score,
            joinedAt: c.joinedAt,
          };
          group.heroIds = Array.isArray(c.heroIds) ? c.heroIds.slice() : collectGroupHeroIds(group.members || []);
          group.ownerIds = Array.isArray(c.ownerIds) ? c.ownerIds.slice() : collectGroupOwnerIds(group.members || []);
          // fast pre-check: avoid calling assignGroupToRoom when the score gap
          // to the room anchor would exceed the effective max window. This
          // prevents permutations from building rooms that violate the
          // configured window even if assignGroupToRoom were to be
          // inconsistently permissive in some edge cases.
          if (room.groupCount > 0 && Number.isFinite(room.anchorScore)) {
            const gap = Math.abs((group.score ?? 0) - room.anchorScore);
            if (gap > effectiveMaxWindow) { ok = false; break; }
          }
          const placed = assignGroupToRoom({ room, group, template, maxWindowAllowed: effectiveMaxWindow });
          if (!placed) {
            if (process && process.env && process.env.DEBUG_MATCHING === '1') {
              try {
                console.log('[matching-recombine-debug] permutation place failed (effective)', JSON.stringify({ group: { role: group.role, size: group.size, score: group.score }, room: { filledSlots: room.filledSlots, anchorScore: room.anchorScore, missingSlots: room.slots.length - room.filledSlots, maxScoreGap: room.maxScoreGap }, effectiveMaxWindow }));
              } catch (e) {}
            }
            ok = false; break;
          }
        }
        if (ok) {
          finalizeRoom(room);
          if (room.ready) {
            if (process && process.env && process.env.DEBUG_MATCHING === '1') {
              try { console.log('[matching-recombine-debug] permutation success'); } catch (e) {}
            }
            return room;
          }
        }
      }
    }

    function dfsLocal(picked, remainingMap) {
      if (++stepsLocal > maxSteps) {
        if (process && process.env && process.env.DEBUG_MATCHING === '1') {
          try {
            console.log('[matching-recombine-debug] trySearchWithCandidates aborted: budget_exhausted', JSON.stringify({ stepsLocal, maxSteps }));
          } catch (e) {}
        }
        return null;
      }
      const needed = Array.from(remainingMap.values()).reduce((s, v) => s + (Number(v) || 0), 0);
      if (needed === 0) {
        // success: build room
        const room = createRoomFromTemplate(template);
        for (const idx of picked) {
          const g = localCandidates[idx];
          const group = {
            role: g.role,
            members: g.members || [],
            groupKey: g.groupKey || null,
            partyKey: g.partyKey || null,
            size: g.size,
            score: g.score,
            joinedAt: g.joinedAt,
          };
          group.heroIds = collectGroupHeroIds(group.members || []);
          group.ownerIds = collectGroupOwnerIds(group.members || []);
          const placed = assignGroupToRoom({ room, group, template, maxWindowAllowed: effectiveMaxWindow });
          if (!placed) return null;
        }
        finalizeRoom(room);
        if (process && process.env && process.env.DEBUG_MATCHING === '1') {
          try { console.log('[matching-recombine-debug] trySearchWithCandidates success', JSON.stringify({ stepsLocal })); } catch (e) {}
        }
        return room;
      }

      for (let i = 0; i < localCandidates.length; i += 1) {
        if (usedLocal[i]) continue;
        const c = localCandidates[i];
        if (!c || !c.role) continue;
        const cap = remainingMap.get(c.role) || 0;
        if (c.size > cap) continue;
        // conflict checks
        let conflict = false;
        if (Array.isArray(c.heroIds)) {
          for (const h of c.heroIds) { if (!h) continue; if (heroSetLocal.has(h)) { conflict = true; break; } }
        }
        if (conflict) continue;
        if (Array.isArray(c.ownerIds)) {
          for (const o of c.ownerIds) { if (!o) continue; if (ownerSetLocal.has(o)) { conflict = true; break; } }
        }
        if (conflict) continue;

        // choose
        usedLocal[i] = true;
        const oldCap = remainingMap.get(c.role) || 0;
        remainingMap.set(c.role, Math.max(0, oldCap - Number(c.size)));
        const addedHeroes = [];
        const addedOwners = [];
        if (Array.isArray(c.heroIds)) {
          for (const h of c.heroIds) { if (h && !heroSetLocal.has(h)) { heroSetLocal.add(h); addedHeroes.push(h); } }
        }
        if (Array.isArray(c.ownerIds)) {
          for (const o of c.ownerIds) { if (o && !ownerSetLocal.has(o)) { ownerSetLocal.add(o); addedOwners.push(o); } }
        }

        const result = dfsLocal(picked.concat(i), remainingMap);
        if (result) return result;

        // undo
        usedLocal[i] = false;
        remainingMap.set(c.role, oldCap);
        for (const h of addedHeroes) heroSetLocal.delete(h);
        for (const o of addedOwners) ownerSetLocal.delete(o);
      }

      return null;
    }

    // start DFS with a shallow clone of provided remaining map or build one
    // from the template roles if none was supplied. We must NOT reference
    // the outer `remaining` variable here because this helper is called
    // earlier in the function (pair/triple quick attempts) before that
    // outer variable is initialized, which causes a TDZ when accessed.
    const remClone = new Map();
    if (baseRemaining && typeof baseRemaining.entries === 'function') {
      for (const [k, v] of baseRemaining.entries()) remClone.set(k, v);
    } else {
      for (const [roleName, meta] of template.roles.entries()) {
        remClone.set(roleName, Number(meta?.capacity) || 0);
      }
    }
    return dfsLocal([], remClone);
  }

  function remainingSlotsSum(map) {
    let s = 0;
    for (const v of map.values()) s += Number(v) || 0;
    return s;
  }

  function dfs(picked) {
    if (++steps > MAX_STEPS) return null;
    const needed = remainingSlotsSum(remaining);
    if (needed === 0) {
      // success: build room
      const room = createRoomFromTemplate(template);
      // place groups in the room using assignGroupToRoom to leverage existing checks
      for (const idx of picked) {
        const g = candidates[idx];
        // reconstruct a minimal group structure expected by assignGroupToRoom
        const group = {
          role: g.role,
          members: g.members || [],
          groupKey: g.groupKey || null,
          partyKey: g.partyKey || null,
          size: g.size,
          score: g.score,
          joinedAt: g.joinedAt,
        };
        // ensure heroIds/ownerIds are present as assignGroupToRoom expects them
        group.heroIds = collectGroupHeroIds(group.members || []);
        group.ownerIds = collectGroupOwnerIds(group.members || []);
        const placed = assignGroupToRoom({ room, group, template, maxWindowAllowed });
        if (!placed) {
          return null; // fail this combination
        }
      }
      finalizeRoom(room);
      return room;
    }

    // Try each unused candidate
    for (let i = 0; i < candidates.length; i += 1) {
      if (used[i]) continue;
      const c = candidates[i];
      if (!c || !c.role) continue;
      const cap = remaining.get(c.role) || 0;
      if (c.size > cap) continue;
      // hero/owner conflict checks
      let conflict = false;
      if (Array.isArray(c.heroIds)) {
        for (const h of c.heroIds) {
          if (!h) continue;
          if (heroSet.has(h)) {
            conflict = true; break;
          }
        }
      }
      if (conflict) continue;
      if (Array.isArray(c.ownerIds)) {
        for (const o of c.ownerIds) {
          if (!o) continue;
          if (ownerSet.has(o)) { conflict = true; break; }
        }
      }
      if (conflict) continue;

      // choose
      used[i] = true;
      // mutate remaining and sets
      const oldCap = remaining.get(c.role) || 0;
      remaining.set(c.role, Math.max(0, oldCap - Number(c.size)));
      const addedHeroes = [];
      const addedOwners = [];
      if (Array.isArray(c.heroIds)) {
        for (const h of c.heroIds) { if (h && !heroSet.has(h)) { heroSet.add(h); addedHeroes.push(h); } }
      }
      if (Array.isArray(c.ownerIds)) {
        for (const o of c.ownerIds) { if (o && !ownerSet.has(o)) { ownerSet.add(o); addedOwners.push(o); } }
      }

      const result = dfs(picked.concat(i));
      if (result) return result;

      // undo
      used[i] = false;
      remaining.set(c.role, oldCap);
      for (const h of addedHeroes) heroSet.delete(h);
      for (const o of addedOwners) ownerSet.delete(o);
    }

    return null;
  }

  // Iteratively increase candidate set size. Each attempt has a per-attempt step cap to
  // keep worst-case CPU bounded. We stop at the first successful recombination.
  const attemptSizes = [8, 12, 16, 24, 32].map(n => Math.min(n, candidates.length));
  const tried = new Set();
  const PER_ATTEMPT_MAX_STEPS = 40000;

  for (const size of attemptSizes) {
    if (tried.has(size)) continue;
    tried.add(size);
    const local = candidates.slice(0, size);
    // quick prune on local set
    const sumLocal = local.reduce((s, c) => s + (Number(c.size) || 0), 0);
    if (sumLocal < totalSlots) continue;
    const found = trySearchWithCandidates(local, PER_ATTEMPT_MAX_STEPS, remaining);
    if (found) return found;
  }

  // final attempt: try entire candidate set with a larger budget
  const FINAL_MAX_STEPS = 200000;
  const fallback = trySearchWithCandidates(candidates, FINAL_MAX_STEPS, remaining);
  if (fallback) return fallback;
  if (process && process.env && process.env.DEBUG_MATCHING === '1') {
    try { console.log('[matching-recombine-debug] tryFormFullRoomFromGroups: main attempts exhausted, proceeding to relaxed final attempt'); } catch (e) {}
  }
  // Final relaxed attempt: as a last resort, try widening the effective
  // score window to the observed span of candidate scores (capped). This
  // is intentionally conservative: only allow when the candidate set is
  // small, and cap the relaxation to avoid creating wildly permissive
  // matches. This restores a narrowly-scoped fallback that recovers a
  // few historical borderline cases while keeping the default strict
  // semantics for larger searches.
  try {
    const scores = candidates.map(c => Number.isFinite(Number(c && c.score)) ? Number(c.score) : 0);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const span = Number.isFinite(minScore) && Number.isFinite(maxScore) ? (maxScore - minScore) : 0;
    const MAX_RELAX_FACTOR = 3; // don't relax window more than this factor
    const RELAX_CAP = 1000; // absolute cap
    // If the user explicitly requested a wider window (via UI action), we
    // allow a guarded override here. The requested value is still subject to
    // the configured caps to prevent abuse or very permissive matching.
    if (Number.isFinite(userRequestedWindow) && userRequestedWindow > 0) {
      const allowed = Math.min(Number(userRequestedWindow), Math.min(maxWindowAllowed * MAX_RELAX_FACTOR, RELAX_CAP));
      if (allowed > maxWindowAllowed) {
        if (process && process.env && process.env.DEBUG_MATCHING === '1') {
          try { console.log('[matching-recombine-debug] user-requested relaxed attempt', { requested: userRequestedWindow, allowed, maxWindowAllowed, span, candidateCount: candidates.length }); } catch (e) {}
        }
        const relaxedUser = trySearchWithCandidates(candidates, FINAL_MAX_STEPS, remaining, allowed);
        if (relaxedUser) return relaxedUser;
      }
    }

    if (candidates.length > 0 && candidates.length <= 6 && span > maxWindowAllowed) {
      const relaxWindow = Math.min(Math.max(span, maxWindowAllowed), Math.min(maxWindowAllowed * MAX_RELAX_FACTOR, RELAX_CAP));
      if (process && process.env && process.env.DEBUG_MATCHING === '1') {
        try { console.log('[matching-recombine-debug] final relaxed attempt', { span, maxWindowAllowed, relaxWindow, candidateCount: candidates.length }); } catch (e) {}
      }
      const relaxed = trySearchWithCandidates(candidates, FINAL_MAX_STEPS, remaining, relaxWindow);
      if (relaxed) return relaxed;
    }
  } catch (e) {
    // ignore
  }

  return null;
}
}
// End of recombination helpers.

function buildResult({
  ready,
  assignments = [],
  rooms = [],
  totalSlots = 0,
  maxWindow = 0,
  error = null,
  suggestion = null,
}) {
  const out = {
    ready: Boolean(ready),
    assignments,
    rooms,
    totalSlots,
    maxWindow,
    error,
  };
  if (suggestion) out.suggestion = suggestion;
  return out;
}

// CommonJS exports for Node scripts (e.g., scripts/run-matching-samples.js)
// Keeping named exports via module.exports enables compatibility with Babel-transpiled ESM imports in tests/Next.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    matchRankParticipants,
    matchSoloRankParticipants,
    matchDuoRankParticipants,
    matchCasualParticipants,
  };
  try { console.log('[matching.js] module.exports keys after assign', Object.keys(module.exports)); } catch (e) {}
}

