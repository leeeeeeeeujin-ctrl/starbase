import { normalizeTimelineStatus } from '@/lib/rank/timelineEvents';

const DEFAULT_ROLE = 'unassigned';

function deriveOwnerId(participant) {
  if (!participant) return null;
  const ownerId =
    participant?.owner_id ??
    participant?.ownerId ??
    participant?.ownerID ??
    participant?.owner?.id ??
    null;
  if (!ownerId) return null;
  const normalized = String(ownerId).trim();
  return normalized || null;
}

function deriveHeroName(participant) {
  if (!participant) return '';
  return (
    participant?.hero?.name ??
    participant?.hero_name ??
    participant?.heroName ??
    participant?.display_name ??
    participant?.name ??
    ''
  );
}

function normalizeRole(role) {
  if (!role || typeof role !== 'string') {
    return DEFAULT_ROLE;
  }
  const normalized = role.trim();
  return normalized || DEFAULT_ROLE;
}

function buildParticipantInfo(participant, index, mode = 'async') {
  const keySource =
    participant?.id ?? participant?.hero_id ?? participant?.heroId ?? participant?.uuid ?? null;
  const fallbackKey = `${normalizeRole(participant?.role)}:${index}`;
  const key = String(keySource ?? fallbackKey);
  const ownerId = deriveOwnerId(participant);
  const heroName = deriveHeroName(participant);
  const status =
    normalizeTimelineStatus(participant?.status) || (mode === 'realtime' ? 'active' : 'proxy');

  return {
    key,
    ownerId,
    role: normalizeRole(participant?.role),
    heroName,
    status,
    participantId: participant?.id ?? participant?.hero_id ?? null,
    slotIndex: index,
  };
}

function determineDepartureCause(info) {
  const status = normalizeTimelineStatus(info?.status);
  if (status === 'defeated') {
    return 'role_defeated';
  }
  if (status === 'spectating') {
    return 'role_spectating';
  }
  if (status === 'proxy') {
    return 'async_proxy_rotation';
  }
  if (status === 'pending') {
    return 'async_pending';
  }
  return 'async_rotation';
}

export function createDropInQueueService() {
  let initialized = false;
  let participantMap = new Map();
  const roleStats = new Map();

  function ensureRoleStats(role) {
    const key = normalizeRole(role);
    if (!roleStats.has(key)) {
      roleStats.set(key, {
        role: key,
        totalArrivals: 0,
        replacements: 0,
        activeKey: null,
        activeInfo: null,
        lastArrivalTurn: null,
        lastDepartureTurn: null,
        lastDepartureCause: null,
      });
    }
    return roleStats.get(key);
  }

  function getSnapshot({ turn } = {}) {
    const roles = [];
    roleStats.forEach(stats => {
      roles.push({
        role: stats.role,
        activeOwnerId: stats.activeInfo?.ownerId || null,
        activeHeroName: stats.activeInfo?.heroName || null,
        activeParticipantId: stats.activeInfo?.participantId ?? null,
        activeSlotIndex: stats.activeInfo?.slotIndex ?? null,
        replacements: stats.replacements,
        totalArrivals: stats.totalArrivals,
        lastArrivalTurn: stats.lastArrivalTurn ?? null,
        lastDepartureTurn: stats.lastDepartureTurn ?? null,
        lastDepartureCause: stats.lastDepartureCause || null,
      });
    });
    roles.sort((a, b) => (a.role || '').localeCompare(b.role || ''));
    const numericTurn = Number.isFinite(Number(turn)) ? Number(turn) : null;
    return { turn: numericTurn, roles };
  }

  function syncParticipants(participants = [], { turnNumber = null, mode = 'async' } = {}) {
    const numericTurn = Number.isFinite(Number(turnNumber)) ? Number(turnNumber) : 0;
    const now = Date.now();
    const newMap = new Map();
    const arrivals = [];
    const departures = [];
    const handledDepartureKeys = new Set();

    participants.forEach((participant, index) => {
      const info = buildParticipantInfo(participant, index, mode);
      newMap.set(info.key, info);
      const previous = participantMap.get(info.key);
      const stats = ensureRoleStats(info.role);

      if (!previous) {
        const replaced =
          stats.activeKey && stats.activeKey !== info.key ? { ...stats.activeInfo } : null;

        if (replaced) {
          handledDepartureKeys.add(replaced.key);
          const cause = determineDepartureCause(replaced);
          departures.push({
            ...replaced,
            turn: numericTurn,
            timestamp: now,
            cause,
          });
          stats.replacements += 1;
          stats.lastDepartureTurn = numericTurn;
          stats.lastDepartureCause = cause;
        }

        stats.totalArrivals += 1;
        stats.activeKey = info.key;
        stats.activeInfo = info;
        stats.lastArrivalTurn = numericTurn;

        arrivals.push({
          ...info,
          turn: numericTurn,
          timestamp: now,
          replaced,
          stats: {
            arrivalOrder: stats.totalArrivals,
            replacements: stats.replacements,
            queueDepth: stats.replacements,
            lastDepartureCause: stats.lastDepartureCause || null,
          },
        });
      } else {
        stats.activeKey = info.key;
        stats.activeInfo = info;
        handledDepartureKeys.add(info.key);
      }
    });

    participantMap.forEach((info, key) => {
      if (newMap.has(key)) return;
      if (handledDepartureKeys.has(key)) return;
      const stats = ensureRoleStats(info.role);
      if (stats.activeKey === key) {
        stats.activeKey = null;
        stats.activeInfo = null;
      }
      const cause = determineDepartureCause(info);
      stats.lastDepartureTurn = numericTurn;
      stats.lastDepartureCause = cause;
      departures.push({
        ...info,
        turn: numericTurn,
        timestamp: now,
        cause,
      });
    });

    participantMap = newMap;
    const snapshot = getSnapshot({ turn: numericTurn });
    const firstRun = !initialized;
    initialized = true;

    if (firstRun) {
      return { arrivals: [], departures: [], snapshot };
    }

    return { arrivals, departures, snapshot };
  }

  function reset() {
    participantMap = new Map();
    roleStats.clear();
    initialized = false;
    return getSnapshot({ turn: null });
  }

  return {
    syncParticipants,
    getSnapshot: (options = {}) => getSnapshot(options),
    reset,
  };
}

export default createDropInQueueService;
