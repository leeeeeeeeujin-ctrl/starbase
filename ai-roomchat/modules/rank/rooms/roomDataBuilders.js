import { MATCH_MODE_KEYS } from '@/lib/rank/matchModes';

export function toStringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function createMatchInstanceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (error) {
      // ignore and fall back
    }
  }
  const suffix = Math.random().toString(36).slice(2, 10);
  return `match_${Date.now()}_${suffix}`;
}

export function buildRosterFromSlots(slots) {
  if (!Array.isArray(slots) || !slots.length) return [];
  return slots.map(slot => {
    const standin = slot?.standin === true;
    const matchSource = toStringOrNull(slot?.matchSource) || (standin ? 'participant_pool' : null);
    const standinPlaceholder =
      slot?.standinPlaceholder === true || matchSource === 'async_standin_placeholder';
    const placeholderOwnerId = standinPlaceholder
      ? toStringOrNull(slot?.placeholderOwnerId || slot?.occupantOwnerId)
      : toStringOrNull(slot?.placeholderOwnerId || null);
    const score = toNumberOrNull(slot?.standinScore ?? slot?.score ?? slot?.expectedScore ?? null);
    const rating = toNumberOrNull(
      slot?.standinRating ?? slot?.rating ?? slot?.expectedRating ?? null
    );
    const battles = toNumberOrNull(slot?.standinBattles ?? slot?.battles ?? null);
    const winRateRaw = slot?.standinWinRate ?? slot?.winRate ?? slot?.expectedWinRate ?? null;
    const winRate =
      winRateRaw !== null && winRateRaw !== undefined && Number.isFinite(Number(winRateRaw))
        ? Number(winRateRaw)
        : null;
    const statusRaw =
      typeof slot?.standinStatus === 'string'
        ? slot.standinStatus.trim()
        : typeof slot?.status === 'string'
          ? slot.status.trim()
          : '';

    return {
      slotId: slot?.id || null,
      slotIndex: Number.isFinite(Number(slot?.slotIndex)) ? Number(slot.slotIndex) : 0,
      role: typeof slot?.role === 'string' && slot.role.trim() ? slot.role.trim() : '역할 미지정',
      ownerId: toStringOrNull(slot?.occupantOwnerId),
      placeholderOwnerId,
      heroId: toStringOrNull(slot?.occupantHeroId),
      heroName: typeof slot?.occupantHeroName === 'string' ? slot.occupantHeroName : '',
      ready: !!slot?.occupantReady,
      joinedAt: slot?.joinedAt || null,
      standin,
      matchSource,
      standinPlaceholder,
      score,
      rating,
      battles,
      winRate,
      status: statusRaw || (standin ? 'standin' : null),
    };
  });
}

export function buildHeroMapFromRoster(roster) {
  return roster.reduce((acc, entry) => {
    if (!entry?.heroId) return acc;
    const key = entry.heroId;
    if (!acc[key]) {
      acc[key] = {
        id: entry.heroId,
        name: entry.heroName || `캐릭터 #${entry.heroId}`,
        ownerId: entry.ownerId,
      };
    }
    return acc;
  }, {});
}

export function buildRolesFromRoster(roster) {
  const map = new Map();
  roster.forEach(entry => {
    if (!entry) return;
    const roleName =
      typeof entry.role === 'string' && entry.role.trim() ? entry.role.trim() : '역할 미지정';
    map.set(roleName, (map.get(roleName) || 0) + 1);
  });
  return Array.from(map.entries()).map(([name, count]) => ({
    name,
    slot_count: count,
  }));
}

export function buildAssignmentsFromRoster(roster) {
  const grouped = new Map();
  roster.forEach(entry => {
    if (!entry) return;
    const roleName =
      typeof entry.role === 'string' && entry.role.trim() ? entry.role.trim() : '역할 미지정';
    if (!grouped.has(roleName)) {
      grouped.set(roleName, []);
    }
    grouped.get(roleName).push(entry);
  });

  return Array.from(grouped.entries()).map(([roleName, entries]) => {
    const sorted = entries
      .map(entry => ({ ...entry }))
      .sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0));

    const members = sorted
      .filter(entry => entry.ownerId && entry.heroId)
      .map(entry => ({
        ownerId: entry.ownerId,
        heroId: entry.heroId,
        heroName: entry.heroName || '',
        ready: !!entry.ready,
        slotIndex: entry.slotIndex || 0,
        joinedAt: entry.joinedAt || null,
      }));

    const roleSlots = sorted.map((entry, localIndex) => ({
      slotId: entry.slotId,
      role: roleName,
      slotIndex: entry.slotIndex || 0,
      localIndex,
      ownerId: entry.ownerId,
      heroId: entry.heroId,
      heroName: entry.heroName || '',
      ready: !!entry.ready,
      joinedAt: entry.joinedAt || null,
      members:
        entry.ownerId && entry.heroId
          ? [
              {
                ownerId: entry.ownerId,
                heroId: entry.heroId,
                heroName: entry.heroName || '',
                ready: !!entry.ready,
                joinedAt: entry.joinedAt || null,
              },
            ]
          : [],
    }));

    return {
      role: roleName,
      slots: roleSlots.length,
      members,
      roleSlots,
    };
  });
}

export function buildSlotLayoutFromRoster(roster) {
  return roster
    .map(entry => ({ ...entry }))
    .sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0))
    .map(entry => ({
      slotId: entry.slotId,
      slotIndex: entry.slotIndex || 0,
      role: entry.role,
      ownerId: entry.ownerId,
      heroId: entry.heroId,
      heroName: entry.heroName || '',
      ready: !!entry.ready,
      joinedAt: entry.joinedAt || null,
    }));
}

export function buildMatchTransferPayload(room, slots) {
  if (!room || !Array.isArray(slots) || !slots.length) return null;
  const roster = buildRosterFromSlots(slots);
  if (!roster.length) return null;
  const heroMap = buildHeroMapFromRoster(roster);
  const roles = buildRolesFromRoster(roster);
  const assignments = buildAssignmentsFromRoster(roster);
  const slotLayout = buildSlotLayoutFromRoster(roster);
  const maxWindow = toNumberOrNull(room?.scoreWindow);
  const timestamp = Date.now();
  const instanceId = createMatchInstanceId();

  const match = {
    instanceId,
    matchInstanceId: instanceId,
    match_instance_id: instanceId,
    assignments,
    maxWindow,
    heroMap,
    matchCode: room?.code || '',
    matchType: 'standard',
    blindMode: !!room?.blindMode,
    brawlVacancies: [],
    roleStatus: {
      slotLayout,
      roles,
      version: timestamp,
      updatedAt: timestamp,
      source: 'room-stage',
    },
    sampleMeta: null,
    dropInTarget: null,
    turnTimer: null,
    rooms: [
      {
        id: room?.id || '',
        code: room?.code || '',
        ownerId: room?.ownerId || null,
        status: room?.status || '',
        mode: room?.mode || '',
        scoreWindow: maxWindow,
        realtimeMode: room?.realtimeMode || '',
        brawlRule: room?.brawlRule || '',
        hostRoleLimit: room?.hostRoleLimit ?? null,
        updatedAt: room?.updatedAt || null,
        blindMode: !!room?.blindMode,
      },
    ],
    roles,
    slotLayout,
    source: 'room-fill',
  };

  const slotTemplate = {
    slots: slotLayout,
    roles,
    version: timestamp,
    updatedAt: timestamp,
    source: 'room-stage',
  };

  return {
    roster,
    heroMap,
    roles,
    assignments,
    slotLayout,
    match,
    matchInstanceId: instanceId,
    slotTemplate,
  };
}

export const CASUAL_MODE_TOKENS = ['casual', '캐주얼', 'normal'];
export const MATCH_READY_DEFAULT_MODE = MATCH_MODE_KEYS.RANK_SHARED;

export function normalizeRoomMode(value) {
  if (typeof value !== 'string') return 'rank';
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'rank';
  return CASUAL_MODE_TOKENS.some(token => normalized.includes(token)) ? 'casual' : 'rank';
}

export function resolveMatchReadyMode(value) {
  if (typeof value !== 'string') return MATCH_READY_DEFAULT_MODE;

  const trimmed = value.trim();
  if (!trimmed) return MATCH_READY_DEFAULT_MODE;

  const lowered = trimmed.toLowerCase();

  if (['casual_private', 'private'].includes(lowered)) {
    return MATCH_MODE_KEYS.CASUAL_PRIVATE;
  }

  if (['casual_match', 'casual', 'normal'].includes(lowered)) {
    return MATCH_MODE_KEYS.CASUAL_MATCH;
  }

  if (['rank_duo', 'duo'].includes(lowered)) {
    return MATCH_MODE_KEYS.RANK_DUO;
  }

  if (['rank_solo', 'solo'].includes(lowered)) {
    return MATCH_MODE_KEYS.RANK_SOLO;
  }

  if (
    [
      MATCH_MODE_KEYS.RANK_SHARED,
      MATCH_MODE_KEYS.RANK_SOLO,
      MATCH_MODE_KEYS.RANK_DUO,
      'rank',
    ].includes(lowered)
  ) {
    return MATCH_MODE_KEYS.RANK_SHARED;
  }

  return trimmed;
}
