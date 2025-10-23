// lib/rank/matchmakingService.js
// Utilities that bridge the generic matching helpers with Supabase storage.
import {
  matchCasualParticipants,
  matchRankParticipants,
  matchSoloRankParticipants,
} from './matching';
import { getMatcherKey, getQueueModes } from './matchModes';
import { withTable } from '../supabaseTables';
import { partitionQueueByHeartbeat, QUEUE_STALE_THRESHOLD_MS } from './queueHeartbeat';
import {
  buildOwnerParticipantIndex,
  guessOwnerParticipant,
  normalizeHeroIdValue,
  resolveParticipantHeroId as deriveParticipantHeroId,
} from './participantUtils';
import {
  loadActiveRoles as loadActiveRolesInternal,
  loadRoleLayout as loadRoleLayoutInternal,
} from './roleLayoutLoader';
import { postCheckMatchAssignments as executePostCheck } from './matchPostCheck';
import { isRealtimeEnabled, normalizeRealtimeMode } from './realtimeModes';

const WAIT_THRESHOLD_SECONDS = 30;

export const loadActiveRoles = loadActiveRolesInternal;
export const loadRoleLayout = loadRoleLayoutInternal;

const MATCHER_BY_KEY = {
  rank: matchRankParticipants,
  rank_solo: matchSoloRankParticipants,
  casual: matchCasualParticipants,
};

function nowIso() {
  return new Date().toISOString();
}

function hasNavigator() {
  return typeof navigator !== 'undefined' && navigator !== null;
}

function hasWindow() {
  return typeof window !== 'undefined' && window !== null;
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function deriveParticipantScore(row) {
  const score = Number(row?.score);
  if (Number.isFinite(score) && score > 0) {
    return score;
  }
  const rating = Number(row?.rating);
  if (Number.isFinite(rating) && rating > 0) {
    return rating;
  }
  return 1000;
}

function resolveParticipantHeroId(row) {
  return deriveParticipantHeroId(row);
}

async function resolveQueueHeroId(supabaseClient, { gameId, ownerId, heroId, role }) {
  const explicitHeroId = normalizeHeroIdValue(heroId);
  if (!gameId || !ownerId) {
    return explicitHeroId;
  }

  try {
    const roster = await loadOwnerParticipantRoster(supabaseClient, {
      gameId,
      ownerIds: [ownerId],
    });
    const guess = guessOwnerParticipant({
      ownerId,
      roster,
      rolePreference: role,
      fallbackHeroId: explicitHeroId,
    });
    return guess.heroId || explicitHeroId;
  } catch (error) {
    console.warn('참가자 정보를 확인하지 못했습니다:', error);
  }

  return explicitHeroId;
}

export async function loadParticipantPool(supabaseClient, gameId) {
  if (!gameId) return [];

  const result = await withTable(supabaseClient, 'rank_participants', table =>
    supabaseClient
      .from(table)
      .select(
        'id, owner_id, hero_id, hero_ids, role, score, rating, status, updated_at, created_at'
      )
      .eq('game_id', gameId)
  );

  if (result?.error) throw result.error;

  const rows = Array.isArray(result?.data) ? result.data : [];
  const alive = rows.filter(row => (row?.status || 'alive') !== 'dead');
  const eligible = alive.filter(row => {
    if (!row) return false;
    const role = row.role || row.role_name || row.roleName;
    if (!role) return false;
    const heroId = resolveParticipantHeroId(row);
    if (!heroId) return false;
    const status = normalizeStatus(row?.status);
    if (DEFEATED_STATUS_SET.has(status)) return false;
    if (status === 'victory') return false;
    if (status === 'retired') return false;
    if (LOCKED_STATUS_SET.has(status)) return false;
    return true;
  });

  return eligible.map(row => ({
    id: null,
    owner_id: row.owner_id || row.ownerId || null,
    ownerId: row.owner_id || row.ownerId || null,
    hero_id: resolveParticipantHeroId(row),
    hero_ids: Array.isArray(row.hero_ids) ? row.hero_ids.filter(Boolean) : [],
    role: row.role || '',
    score: deriveParticipantScore(row),
    rating: deriveParticipantScore(row),
    status: 'waiting',
    joined_at: row.updated_at || row.created_at || null,
    simulated: true,
    standin: true,
    match_source: 'participant_pool',
  }));
}

function normalizeOwnerIds(values = []) {
  return values
    .map(value => {
      if (value == null) return null;
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      if (typeof value === 'object' && value !== null && typeof value.id !== 'undefined') {
        return String(value.id);
      }
      return null;
    })
    .filter(value => typeof value === 'string' && value.length > 0);
}

export async function loadOwnerParticipantRoster(supabaseClient, { gameId, ownerIds = [] } = {}) {
  if (!gameId) {
    return new Map();
  }

  const result = await withTable(supabaseClient, 'rank_participants', table => {
    let query = supabaseClient
      .from(table)
      .select(
        'owner_id, hero_id, hero_ids, role, score, rating, status, slot_index, slot_no, updated_at, created_at'
      )
      .eq('game_id', gameId);

    const ids = normalizeOwnerIds(ownerIds);
    if (ids.length > 0) {
      if (ids.length === 1) {
        query = query.eq('owner_id', ids[0]);
      } else {
        query = query.in('owner_id', ids);
      }
    }

    return query;
  });

  if (result?.error) {
    throw result.error;
  }

  const rows = Array.isArray(result?.data) ? result.data : [];
  return buildOwnerParticipantIndex(rows);
}

export async function postCheckMatchAssignments(supabaseClient, options = {}) {
  return executePostCheck(supabaseClient, options, {
    loadRoster: ({ gameId, ownerIds }) =>
      loadOwnerParticipantRoster(supabaseClient, { gameId, ownerIds }),
  });
}

function normalizeStatus(value) {
  if (!value) return 'alive';
  if (typeof value !== 'string') return 'alive';
  return value.trim().toLowerCase() || 'alive';
}

const DEFEATED_STATUS_SET = new Set(['defeated', 'lost', 'out', 'retired', 'eliminated', 'dead']);

const LOCKED_STATUS_SET = new Set([
  'engaged',
  'engaged_offense',
  'engaged_defense',
  'locked',
  'pending_battle',
]);

export async function loadRoleStatusCounts(supabaseClient, gameId) {
  if (!gameId) return new Map();

  const result = await withTable(supabaseClient, 'rank_participants', table =>
    supabaseClient.from(table).select('role, status').eq('game_id', gameId)
  );

  if (result?.error) throw result.error;

  const rows = Array.isArray(result?.data) ? result.data : [];
  const map = new Map();

  rows.forEach(row => {
    const roleName = (row?.role || '').trim();
    if (!roleName) return;
    const status = normalizeStatus(row?.status);
    const bucket = map.get(roleName) || { total: 0, active: 0, defeated: 0 };
    bucket.total += 1;
    if (DEFEATED_STATUS_SET.has(status)) {
      bucket.defeated += 1;
    } else {
      bucket.active += 1;
    }
    map.set(roleName, bucket);
  });

  return map;
}

async function loadRealtimeToggle(supabaseClient, gameId) {
  if (!gameId) return false;

  const { data, error } = await withTable(supabaseClient, 'rank_games', table =>
    supabaseClient.from(table).select('realtime_match').eq('id', gameId).maybeSingle()
  );

  if (error) throw error;

  const mode = normalizeRealtimeMode(data?.realtime_match);
  return isRealtimeEnabled(mode);
}

export async function loadMatchSampleSource(
  supabaseClient,
  { gameId, mode, realtimeEnabled: realtimeOverride } = {}
) {
  if (!gameId) {
    return {
      realtimeEnabled: false,
      sampleType: 'participant_pool',
      entries: [],
      queue: [],
      participantPool: [],
      generatedAt: new Date().toISOString(),
    };
  }

  let realtimeEnabled =
    typeof realtimeOverride === 'boolean'
      ? realtimeOverride
      : await loadRealtimeToggle(supabaseClient, gameId);

  const [queueEntries, participantPool] = await Promise.all([
    loadQueueEntries(supabaseClient, { gameId, mode }),
    loadParticipantPool(supabaseClient, gameId),
  ]);

  const queueAnnotated = Array.isArray(queueEntries)
    ? queueEntries.map(entry => ({
        ...entry,
        match_source: entry?.match_source || 'realtime_queue',
        standin: false,
        simulated: Boolean(entry?.simulated) && entry.simulated === true,
      }))
    : [];

  const participantAnnotated = Array.isArray(participantPool)
    ? participantPool.map(entry => ({
        ...entry,
        match_source: entry?.match_source || 'participant_pool',
        standin: true,
        simulated: true,
      }))
    : [];

  const waitInfo = computeQueueWaitInfo(queueAnnotated);

  let sampleEntries = realtimeEnabled ? queueAnnotated.slice() : participantAnnotated.slice();
  let sampleType = realtimeEnabled ? 'realtime_queue' : 'participant_pool';

  if (realtimeEnabled) {
    if (queueAnnotated.length === 0) {
      sampleEntries = participantAnnotated.slice();
      if (sampleEntries.length > 0) {
        sampleType = 'realtime_queue_fallback_pool';
      }
    } else if (
      typeof waitInfo.waitSeconds === 'number' &&
      waitInfo.waitSeconds < WAIT_THRESHOLD_SECONDS &&
      waitInfo.waitSeconds >= 0
    ) {
      sampleEntries = queueAnnotated.slice();
      sampleType = 'realtime_queue_waiting';
    } else {
      sampleEntries = queueAnnotated.slice();
      sampleType = 'realtime_queue';
    }
  } else if (!Array.isArray(sampleEntries) || sampleEntries.length === 0) {
    sampleEntries = queueAnnotated.slice();
    if (Array.isArray(sampleEntries) && sampleEntries.length > 0) {
      sampleType = 'participant_pool_fallback_queue';
    }
  }

  return {
    realtimeEnabled: Boolean(realtimeEnabled),
    sampleType,
    entries: Array.isArray(sampleEntries) ? sampleEntries : [],
    queue: queueAnnotated,
    participantPool: participantAnnotated,
    generatedAt: new Date().toISOString(),
    queueWaitSeconds:
      typeof waitInfo.waitSeconds === 'number' && Number.isFinite(waitInfo.waitSeconds)
        ? waitInfo.waitSeconds
        : null,
    queueOldestJoinedAt: waitInfo.oldestJoinedAt,
    queueWaitThresholdSeconds: WAIT_THRESHOLD_SECONDS,
    standinCount: 0,
  };
}

function computeQueueWaitInfo(queueEntries = []) {
  if (!Array.isArray(queueEntries) || queueEntries.length === 0) {
    return { waitSeconds: null, oldestJoinedAt: null };
  }

  let oldestTimestamp = Number.POSITIVE_INFINITY;
  let oldestIso = null;

  queueEntries.forEach(entry => {
    if (!entry) return;
    const joined = entry.joined_at || entry.joinedAt;
    if (!joined) return;
    const parsed = Date.parse(joined);
    if (!Number.isFinite(parsed)) return;
    if (parsed < oldestTimestamp) {
      oldestTimestamp = parsed;
      oldestIso = new Date(parsed).toISOString();
    }
  });

  if (!Number.isFinite(oldestTimestamp)) {
    return { waitSeconds: null, oldestJoinedAt: null };
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - oldestTimestamp);
  return { waitSeconds: diffMs / 1000, oldestJoinedAt: oldestIso };
}

export function normalizeQueueEntry(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const id = row.id ?? row.ticket_id ?? row.queue_entry_id ?? null;
  const gameId = row.game_id ?? row.gameId ?? null;
  const queueId = row.queue_id ?? row.queueId ?? null;
  const ownerId = row.owner_id ?? row.ownerId ?? null;
  const heroId = row.hero_id ?? row.heroId ?? null;
  const role = row.role ?? row.role_name ?? row.roleName ?? '';
  const mode = row.mode ?? row.queue_mode ?? '';
  const statusValue = row.status ?? row.queue_status ?? 'waiting';
  const status =
    typeof statusValue === 'string' && statusValue.trim() ? statusValue.trim() : 'waiting';
  const joinedAtRaw = row.joined_at ?? row.joinedAt ?? row.created_at ?? row.createdAt ?? null;
  const updatedAtRaw = row.updated_at ?? row.updatedAt ?? null;
  const scoreRaw = row.score ?? row.rating ?? row.mmr ?? null;
  const score = Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null;
  const partyKey = row.party_key ?? row.partyKey ?? null;
  const matchSource = row.match_source ?? row.matchSource ?? 'realtime_queue';
  const simulated = row.simulated === true || row.simulated === 'true';
  const standin = row.standin === true || row.standin === 'true';

  const normalized = {
    ...row,
    id: id != null ? String(id) : id,
    queue_id: queueId != null ? String(queueId) : queueId,
    queueId: queueId != null ? String(queueId) : queueId,
    game_id: gameId,
    gameId,
    owner_id: ownerId,
    ownerId,
    hero_id: heroId,
    heroId,
    role,
    mode,
    status,
    score,
    party_key: partyKey,
    partyKey,
    joined_at: joinedAtRaw,
    joinedAt: joinedAtRaw,
    updated_at: updatedAtRaw,
    updatedAt: updatedAtRaw,
    match_source: matchSource,
    matchSource,
    simulated,
    standin,
  };

  return normalized;
}

export async function loadQueueEntries(supabaseClient, { gameId, mode }) {
  if (!gameId) return [];
  const queueModes = getQueueModes(mode);
  const filters = queueModes.length ? queueModes : [mode].filter(Boolean);
  const result = await withTable(supabaseClient, 'rank_match_queue', table => {
    let query = supabaseClient
      .from(table)
      .select(
        'id, game_id, mode, owner_id, hero_id, role, score, joined_at, updated_at, status, party_key, match_source, simulated'
      )
      .eq('game_id', gameId)
      .eq('status', 'waiting')
      .order('joined_at', { ascending: true });
    if (filters.length > 1) {
      query = query.in('mode', filters);
    } else if (filters.length === 1) {
      query = query.eq('mode', filters[0]);
    }
    return query;
  });
  if (result?.error) throw result.error;
  const rows = Array.isArray(result?.data) ? result.data : [];
  return rows
    .map(row => normalizeQueueEntry(row))
    .filter(entry => entry && (entry.status || 'waiting') === 'waiting');
}

export function filterStaleQueueEntries(
  queueEntries = [],
  { staleThresholdMs = QUEUE_STALE_THRESHOLD_MS, nowMs = Date.now() } = {}
) {
  return partitionQueueByHeartbeat(queueEntries, {
    staleThresholdMs,
    nowMs,
  });
}

export async function heartbeatQueueEntry(supabaseClient, { gameId, mode, ownerId }) {
  if (!gameId || !ownerId) {
    return { ok: false, error: '대기열 정보를 확인할 수 없습니다.' };
  }

  const now = nowIso();
  const result = await withTable(supabaseClient, 'rank_match_queue', table => {
    let query = supabaseClient
      .from(table)
      .update({ updated_at: now })
      .eq('game_id', gameId)
      .eq('owner_id', ownerId)
      .eq('status', 'waiting');
    if (mode) {
      query = query.eq('mode', mode);
    }
    return query;
  });

  if (result?.error) {
    console.warn('대기열 하트비트 갱신 실패:', result.error);
    return { ok: false, error: result.error.message || '대기열 상태를 갱신하지 못했습니다.' };
  }

  return { ok: true, updatedAt: now };
}

export async function removeQueueEntry(supabaseClient, { gameId, mode, ownerId }) {
  if (!gameId || !ownerId) return { ok: true };
  const result = await withTable(supabaseClient, 'rank_match_queue', table => {
    let query = supabaseClient.from(table).delete().eq('game_id', gameId).eq('owner_id', ownerId);
    if (mode) {
      query = query.eq('mode', mode);
    }
    return query;
  });
  if (result?.error) {
    console.warn('큐 제거 실패:', result.error);
    return { ok: false, error: result.error.message || '대기열에서 제거하지 못했습니다.' };
  }
  return { ok: true };
}

export function emitQueueLeaveBeacon({ gameId, mode, ownerId, heroId = null }) {
  if (!gameId || !ownerId || !hasNavigator()) {
    return false;
  }

  const payload = {
    gameId,
    ownerId,
    mode: mode || null,
  };

  if (heroId != null) {
    payload.heroId = heroId;
  }

  const body = JSON.stringify(payload);
  const endpoint = '/api/rank/match/leave';

  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      return navigator.sendBeacon(endpoint, blob);
    }

    if (typeof fetch === 'function') {
      fetch(endpoint, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: hasWindow(),
      }).catch(() => {});
      return true;
    }
  } catch (error) {
    console.warn('대기열 이탈 신호 전송 실패:', error);
  }

  return false;
}

export async function enqueueParticipant(
  supabaseClient,
  { gameId, mode, ownerId, heroId, role, score = 1000, partyKey = null }
) {
  if (!gameId || !mode || !ownerId || !role) {
    return { ok: false, error: '대기열에 필요한 정보가 부족합니다.' };
  }

  const resolvedHeroId = await resolveQueueHeroId(supabaseClient, {
    gameId,
    ownerId,
    heroId,
    role,
  });

  const duplicateCheck = await withTable(supabaseClient, 'rank_match_queue', table =>
    supabaseClient
      .from(table)
      .select('id, game_id, mode, status, hero_id')
      .eq('owner_id', ownerId)
      .in('status', ['waiting', 'matched'])
  );

  if (duplicateCheck?.error) {
    console.warn('대기열 중복 상태를 확인하지 못했습니다:', duplicateCheck.error);
    return {
      ok: false,
      error: '대기열 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.',
    };
  }

  let duplicateEntries = [];
  const otherGameQueueEntries = [];

  if (Array.isArray(duplicateCheck?.data)) {
    duplicateEntries = duplicateCheck.data.filter(entry => {
      if (!entry) return false;
      const entryGameId = entry.game_id ?? entry.gameId;
      const entryMode = entry.mode;
      const entryStatus = (entry.status || '').toString().toLowerCase();

      const sameGame = String(entryGameId ?? '') === String(gameId ?? '');
      const sameMode = String(entryMode ?? '') === String(mode ?? '');
      const isWaiting = entryStatus === 'waiting';
      const isMatched = entryStatus === 'matched';

      if (!sameGame) {
        if (isWaiting || isMatched) {
          otherGameQueueEntries.push(entry);
        }
        // Temporary override: allow multi-game queueing during test cycle.
        // TODO(ranked-launch): Reinstate cross-game queue lock once game shutdown &
        // cleanup flows are complete.
        return false;
      }

      if (sameMode && isWaiting) {
        return false;
      }

      return isMatched || sameGame;
    });
  }

  if (otherGameQueueEntries.length > 0) {
    const otherGameIds = Array.from(
      new Set(
        otherGameQueueEntries
          .map(entry => entry?.game_id ?? entry?.gameId)
          .map(value => (value == null ? null : String(value)))
      )
    ).filter(Boolean);

    if (otherGameIds.length > 0) {
      const cleanupResult = await withTable(supabaseClient, 'rank_match_queue', table =>
        supabaseClient
          .from(table)
          .update({ status: 'abandoned', party_key: null, updated_at: nowIso() })
          .eq('owner_id', ownerId)
          .in('status', ['waiting', 'matched'])
          .in('game_id', otherGameIds)
      );

      if (cleanupResult?.error) {
        console.warn('다른 게임 대기열 정리 실패:', cleanupResult.error);
      }
    }
  }

  if (duplicateEntries.length > 0) {
    return {
      ok: false,
      error: '이미 다른 대기열에 참여 중입니다. 기존 대기열을 먼저 취소해주세요.',
    };
  }

  const payload = {
    game_id: gameId,
    mode,
    owner_id: ownerId,
    hero_id: resolvedHeroId ?? null,
    role,
    score,
    party_key: partyKey,
    status: 'waiting',
    joined_at: nowIso(),
    updated_at: nowIso(),
  };

  const insert = await withTable(supabaseClient, 'rank_match_queue', async table => {
    // Supabase upsert requires unique constraint, so attempt delete + insert.
    await supabaseClient
      .from(table)
      .delete()
      .eq('game_id', gameId)
      .eq('mode', mode)
      .eq('owner_id', ownerId)
      .in('status', ['waiting', 'matched']);

    return supabaseClient.from(table).insert(payload, { defaultToNull: false });
  });

  if (insert?.error) {
    console.error('대기열 등록 실패:', insert.error);
    return { ok: false, error: insert.error.message || '대기열에 등록하지 못했습니다.' };
  }

  return { ok: true, heroId: resolvedHeroId ?? null };
}

export function runMatching({ mode, roles, queue }) {
  const matcherKey = getMatcherKey(mode);
  const matcher = MATCHER_BY_KEY[matcherKey] || MATCHER_BY_KEY[mode];
  if (!matcher) {
    return { ready: false, assignments: [], totalSlots: 0, error: { type: 'unsupported_mode' } };
  }
  const result = matcher({ roles, queue });

  // Safe fallback: If enabled and not ready, try a simple exact-fit per-role assignment
  // ignoring score windows, preserving earliest-joined ordering.
  const SAFE = String(process.env.RANK_MATCH_SAFE_FALLBACK || '').toLowerCase();
  const safeEnabled = SAFE === '1' || SAFE === 'true' || SAFE === 'yes';
  if (!result?.ready && safeEnabled) {
    const fallback = buildExactFitFallbackAssignments(roles, queue);
    if (fallback.ready) return fallback;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Safe exact-fit fallback (minimalistic, score-agnostic)
// ---------------------------------------------------------------------------

function buildExactFitFallbackAssignments(rawRoles = [], rawQueue = []) {
  const roles = normalizeRolesForFallback(rawRoles);
  const totalSlots = roles.reduce((acc, r) => acc + r.slotCount, 0);
  if (totalSlots === 0) {
    return {
      ready: false,
      assignments: [],
      totalSlots,
      maxWindow: 0,
      error: { type: 'no_active_slots' },
    };
  }

  // Normalize queue shape we expect from loadQueueEntries
  const queue = Array.isArray(rawQueue)
    ? rawQueue
        .map(row => normalizeQueueRowForFallback(row))
        .filter(e => e && e.role && e.id)
        .sort((a, b) => a.joinedAt - b.joinedAt)
    : [];

  const byRole = new Map();
  queue.forEach(e => {
    if (!byRole.has(e.role)) byRole.set(e.role, []);
    byRole.get(e.role).push(e);
  });

  const usedHeroIds = new Set();
  const assignments = [];

  for (const role of roles) {
    const candidates = (byRole.get(role.name) || []).slice();
    let need = role.slotCount;
    const picked = [];

    for (const entry of candidates) {
      if (need <= 0) break;
      // ensure hero uniqueness globally across roles
      const heroId = entry.hero_id || entry.heroId;
      if (heroId && usedHeroIds.has(String(heroId))) {
        continue;
      }
      picked.push(entry);
      if (heroId) usedHeroIds.add(String(heroId));
      need -= 1;
    }

    const roleSlots = [];
    for (let i = 0; i < picked.length; i += 1) roleSlots.push(i);

    assignments.push({
      role: role.name,
      slots: role.slotCount,
      roleSlots: roleSlots,
      members: picked.map(e => ({ ...e.original })),
      groups: [],
      ready: picked.length >= role.slotCount,
      anchorScore: null,
      joinedAt: picked[0]?.joinedAt || null,
    });
  }

  const filled = assignments.reduce(
    (acc, a) => acc + (Array.isArray(a.members) ? a.members.length : 0),
    0
  );
  const ready = assignments.every(a => a.ready);
  return { ready, assignments, totalSlots, maxWindow: 0 };
}

function normalizeRolesForFallback(raw = []) {
  const out = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!r) continue;
    const name = typeof r === 'string' ? r : r.name || r.role;
    const slotCount = Number(r?.slot_count ?? r?.slotCount ?? r?.slots ?? 0);
    if (!name || !Number.isFinite(slotCount) || slotCount <= 0) continue;
    out.push({ name: String(name).trim(), slotCount: Math.trunc(slotCount) });
  }
  return out;
}

function normalizeQueueRowForFallback(row) {
  if (!row || typeof row !== 'object') return null;
  const id = row.id ?? row.queue_id ?? row.queueId;
  const role = row.role || row.role_name || row.roleName;
  if (!id || !role) return null;
  // Prefer hero_id; fallback to first of hero_ids; else null
  let heroId = row.hero_id ?? row.heroId ?? null;
  if (!heroId && Array.isArray(row.hero_ids) && row.hero_ids.length) {
    heroId = row.hero_ids[0];
  }
  const joinedAtRaw = row.joined_at ?? row.joinedAt ?? row.created_at ?? row.createdAt;
  const joinedAt = Number.isFinite(Date.parse(joinedAtRaw)) ? Date.parse(joinedAtRaw) : Date.now();
  return {
    id: String(id),
    role: String(role).trim(),
    hero_id: heroId != null ? String(heroId) : null,
    owner_id: row.owner_id ?? row.ownerId ?? null,
    score: Number.isFinite(Number(row.score)) ? Number(row.score) : 1000,
    joinedAt,
    original: row,
  };
}

export function extractViewerAssignment({ assignments = [], viewerId, heroId }) {
  const normalizedViewerId = viewerId ? String(viewerId) : '';
  const normalizedHeroId = heroId ? String(heroId) : '';
  for (const assignment of assignments) {
    if (!Array.isArray(assignment.members)) continue;
    const matched = assignment.members.some(member => {
      if (!member) return false;
      const ownerId = member.owner_id ?? member.ownerId;
      if (normalizedViewerId && ownerId && String(ownerId) === normalizedViewerId) {
        return true;
      }
      if (normalizedHeroId) {
        const memberHeroId = member.hero_id ?? member.heroId;
        if (memberHeroId && String(memberHeroId) === normalizedHeroId) {
          return true;
        }
      }
      return false;
    });
    if (matched) {
      return assignment;
    }
  }
  return null;
}

export async function markAssignmentsMatched(
  supabaseClient,
  { assignments = [], gameId, mode, matchCode }
) {
  const ids = new Set();
  const ownerIds = new Set();
  assignments.forEach(assignment => {
    ensureArray(assignment.members).forEach(member => {
      if (member?.id) {
        ids.add(member.id);
      }
      const ownerId = member?.owner_id || member?.ownerId;
      if (ownerId) {
        ownerIds.add(ownerId);
      }
    });
  });
  if (ids.size > 0) {
    const payload = {
      status: 'matched',
      updated_at: nowIso(),
    };
    if (matchCode) payload.match_code = matchCode;

    const result = await withTable(supabaseClient, 'rank_match_queue', table =>
      supabaseClient.from(table).update(payload).in('id', Array.from(ids))
    );
    if (result?.error) {
      console.warn('매칭 상태 갱신 실패:', result.error);
    }
  }

  if (ownerIds.size > 0) {
    await lockParticipantsForAssignments(supabaseClient, {
      gameId,
      ownerIds: Array.from(ownerIds),
    });
  }
}

async function lockParticipantsForAssignments(supabaseClient, { gameId, ownerIds }) {
  if (!gameId || !Array.isArray(ownerIds) || ownerIds.length === 0) return;

  const now = nowIso();
  const filterOwners = Array.from(new Set(ownerIds.filter(Boolean)));
  if (!filterOwners.length) return;

  const result = await withTable(supabaseClient, 'rank_participants', table => {
    let query = supabaseClient
      .from(table)
      .update({ status: 'engaged', updated_at: now })
      .eq('game_id', gameId)
      .in('owner_id', filterOwners);

    query = query.not('status', 'in', '("victory","defeated","retired","eliminated")');

    return query;
  });

  if (result?.error) {
    console.warn('참가자 잠금 실패:', result.error);
  }
}

export async function loadHeroesByIds(supabaseClient, heroIds) {
  const unique = Array.from(new Set(heroIds.filter(Boolean)));
  if (!unique.length) return new Map();
  const result = await withTable(supabaseClient, 'heroes', table =>
    supabaseClient.from(table).select('id, name, image_url, owner_id').in('id', unique)
  );
  if (result?.error) throw result.error;
  const rows = Array.isArray(result?.data) ? result.data : [];
  return new Map(
    rows.map(row => [
      row.id,
      {
        id: row.id,
        name: row.name,
        hero_name: row.name,
        imageUrl: row.image_url,
        image_url: row.image_url,
        ownerId: row.owner_id,
      },
    ])
  );
}

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function buildRemovedMember(member, slot, reason, slotKey) {
  if (!member || typeof member !== 'object') return null;
  const ownerId =
    normalizeId(member.owner_id) ?? normalizeId(member.ownerId) ?? normalizeId(member.ownerID);
  const heroId =
    normalizeId(member.hero_id) ?? normalizeId(member.heroId) ?? normalizeId(member.heroID);
  const role = normalizeId(slot?.role) ?? null;
  const slotIndex = Number.isFinite(Number(slot?.slotIndex)) ? Number(slot.slotIndex) : null;
  return {
    ownerId,
    heroId,
    role,
    slotIndex,
    reason: reason || 'duplicate',
    slotKey: slotKey || null,
  };
}

export function sanitizeAssignments(assignments = []) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return Array.isArray(assignments) ? assignments : [];
  }

  return assignments
    .map(assignment => {
      if (!assignment || typeof assignment !== 'object') return assignment;

      const ownerSeen = new Set();
      const heroSeen = new Set();
      const slotSeen = new Set();
      const sanitizedRoleSlots = [];
      const removedMembers = [];

      const roleSlots = Array.isArray(assignment.roleSlots)
        ? assignment.roleSlots
        : Array.isArray(assignment.slots)
          ? assignment.slots
          : [];

      roleSlots.forEach((slot, slotOrdinal) => {
        if (!slot || typeof slot !== 'object') {
          return;
        }

        const slotId = normalizeId(slot.slot_id ?? slot.slotId);
        const slotIndex = Number.isFinite(Number(slot.slotIndex)) ? Number(slot.slotIndex) : null;
        const slotKey =
          slotId || (slotIndex !== null ? `slot:${slotIndex}` : `index:${slotOrdinal}`);

        if (slotKey && slotSeen.has(slotKey)) {
          const removed = Array.isArray(slot.members) ? slot.members : [];
          removed
            .map(member => buildRemovedMember(member, slot, 'duplicate_slot', slotKey))
            .filter(Boolean)
            .forEach(entry => removedMembers.push(entry));
          return;
        }

        if (slotKey) {
          slotSeen.add(slotKey);
        }

        const rawMembers = [];
        if (Array.isArray(slot.members)) {
          rawMembers.push(...slot.members);
        }
        if (slot.member && !rawMembers.includes(slot.member)) {
          rawMembers.unshift(slot.member);
        }

        const memberSeenInSlot = new Set();
        const slotMembers = [];

        rawMembers.forEach(member => {
          if (!member || typeof member !== 'object') {
            return;
          }

          const normalizedOwner =
            normalizeId(member.owner_id) ??
            normalizeId(member.ownerId) ??
            normalizeId(member.ownerID);
          const normalizedHero =
            normalizeId(member.hero_id) ?? normalizeId(member.heroId) ?? normalizeId(member.heroID);

          const slotMemberKey =
            normalizedOwner || normalizedHero || `${slotKey}:member:${memberSeenInSlot.size}`;
          if (slotMemberKey && memberSeenInSlot.has(slotMemberKey)) {
            const removed = buildRemovedMember(member, slot, 'duplicate_slot_member', slotKey);
            if (removed) removedMembers.push(removed);
            return;
          }
          if (slotMemberKey) {
            memberSeenInSlot.add(slotMemberKey);
          }

          if (normalizedOwner && ownerSeen.has(normalizedOwner)) {
            const removed = buildRemovedMember(member, slot, 'duplicate_owner', slotKey);
            if (removed) removedMembers.push(removed);
            return;
          }
          if (normalizedHero && heroSeen.has(normalizedHero)) {
            const removed = buildRemovedMember(member, slot, 'duplicate_hero', slotKey);
            if (removed) removedMembers.push(removed);
            return;
          }

          if (normalizedOwner) {
            ownerSeen.add(normalizedOwner);
          }
          if (normalizedHero) {
            heroSeen.add(normalizedHero);
          }

          const clone = { ...member };
          if (normalizedOwner) {
            clone.owner_id = normalizedOwner;
            clone.ownerId = normalizedOwner;
          }
          if (normalizedHero) {
            clone.hero_id = normalizedHero;
            clone.heroId = normalizedHero;
          }
          slotMembers.push(clone);
        });

        const sanitizedSlot = { ...slot };
        sanitizedSlot.members = slotMembers;
        sanitizedSlot.member = slotMembers.length ? { ...slotMembers[0] } : null;
        sanitizedSlot.occupied = slotMembers.length > 0;
        sanitizedRoleSlots.push(sanitizedSlot);
      });

      const sanitizedMembers = [];
      sanitizedRoleSlots.forEach(slot => {
        ensureArray(slot.members).forEach(member => {
          if (member) sanitizedMembers.push(member);
        });
      });

      const filledSlots = sanitizedRoleSlots.filter(slot => slot.occupied).length;
      const missingSlots = sanitizedRoleSlots.length - filledSlots;

      const sanitizedGroups = Array.isArray(assignment.groups)
        ? assignment.groups
            .map(group => {
              if (!group || typeof group !== 'object') return null;
              const indices = Array.isArray(group.slotIndices) ? group.slotIndices : [];
              const uniqueIndices = Array.from(
                new Set(indices.map(value => Number(value)).filter(value => Number.isFinite(value)))
              );
              return {
                ...group,
                slotIndices: uniqueIndices,
                size: uniqueIndices.length || group.size || 0,
              };
            })
            .filter(Boolean)
        : [];

      const base = { ...assignment };
      base.roleSlots = sanitizedRoleSlots;
      if (Array.isArray(assignment.slots)) {
        base.slots = sanitizedRoleSlots;
      }
      base.members = sanitizedMembers;
      base.filledSlots = filledSlots;
      base.missingSlots = missingSlots;
      base.groups = sanitizedGroups;
      base.removedMembers = [
        ...(Array.isArray(assignment.removedMembers) ? assignment.removedMembers : []),
        ...removedMembers,
      ];

      return base;
    })
    .filter(Boolean);
}

export function flattenAssignmentMembers(assignments = []) {
  const sanitized = sanitizeAssignments(assignments);
  const members = [];
  sanitized.forEach(assignment => {
    ensureArray(assignment.members).forEach(member => {
      if (member) members.push(member);
    });
  });
  return members;
}

function cloneMembers(members = []) {
  if (!Array.isArray(members)) return [];
  return members
    .map(member => {
      if (!member || typeof member !== 'object') return null;
      return { ...member };
    })
    .filter(Boolean);
}

function mergeRoomRemovedMembers(...lists) {
  const merged = [];
  const seen = new Set();
  lists.forEach(list => {
    if (!Array.isArray(list)) return;
    list.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      const ownerId = normalizeId(entry.ownerId ?? entry.owner_id);
      const heroId = normalizeId(entry.heroId ?? entry.hero_id);
      const role = normalizeId(entry.role);
      const reason = normalizeId(entry.reason);
      const slotIndexRaw = entry.slotIndex ?? entry.slot_index;
      const slotIndex = Number.isFinite(Number(slotIndexRaw)) ? Number(slotIndexRaw) : null;
      const key = [ownerId || '', heroId || '', role || '', slotIndex ?? '', reason || ''].join(
        '|'
      );
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({
        ...entry,
        ownerId: ownerId || entry.ownerId || entry.owner_id || null,
        heroId: heroId || entry.heroId || entry.hero_id || null,
        slotIndex: slotIndex,
        role: role || entry.role || null,
        reason: reason || entry.reason || null,
      });
    });
  });
  return merged;
}

function sanitizeRoomGroups(groups = []) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map(group => {
      if (!group || typeof group !== 'object') return null;
      const indices = Array.isArray(group.slotIndices) ? group.slotIndices : [];
      const unique = Array.from(
        new Set(indices.map(value => Number(value)).filter(value => Number.isFinite(value)))
      );
      return {
        ...group,
        slotIndices: unique,
        size: unique.length || group.size || 0,
      };
    })
    .filter(Boolean);
}

export function sanitizeRooms(rooms = []) {
  if (!Array.isArray(rooms) || rooms.length === 0) {
    return Array.isArray(rooms) ? rooms : [];
  }

  return rooms.map((room, index) => {
    if (!room || typeof room !== 'object') {
      return room;
    }

    const slotList = Array.isArray(room.slots) ? room.slots : [];
    const members = Array.isArray(room.members) ? room.members : [];

    const syntheticAssignment = {
      role: room.label || room.role || `room-${index + 1}`,
      roleSlots: slotList,
      members,
      groups: Array.isArray(room.groups) ? room.groups : [],
      removedMembers: Array.isArray(room.removedMembers) ? room.removedMembers : [],
    };

    const [sanitized] = sanitizeAssignments([syntheticAssignment]);
    if (!sanitized) {
      return {
        ...room,
        slots: slotList,
        members,
        groups: sanitizeRoomGroups(room.groups),
      };
    }

    const sanitizedSlots = Array.isArray(sanitized.roleSlots) ? sanitized.roleSlots : [];
    const normalizedSlots = sanitizedSlots.map(slot => {
      if (!slot || typeof slot !== 'object') return slot;
      const slotMembers = cloneMembers(slot.members);
      return {
        ...slot,
        members: slotMembers,
        member: slotMembers.length ? { ...slotMembers[0] } : null,
        occupied: slotMembers.length > 0,
      };
    });

    const sanitizedMembers = cloneMembers(sanitized.members);
    const baseRemoved = Array.isArray(room.removedMembers) ? room.removedMembers : [];
    const sanitizedRemoved = Array.isArray(sanitized.removedMembers)
      ? sanitized.removedMembers
      : [];

    return {
      ...room,
      slots: normalizedSlots,
      members: sanitizedMembers,
      filledSlots:
        typeof sanitized.filledSlots === 'number'
          ? sanitized.filledSlots
          : normalizedSlots.filter(slot => slot?.occupied).length,
      missingSlots:
        typeof sanitized.missingSlots === 'number'
          ? sanitized.missingSlots
          : Math.max(0, normalizedSlots.length - sanitizedMembers.length),
      groups: sanitizeRoomGroups(room.groups),
      removedMembers: mergeRoomRemovedMembers(baseRemoved, sanitizedRemoved),
    };
  });
}
