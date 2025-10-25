import { addDebugEvent, addSupabaseDebugEvent } from '@/lib/debugCollector';
import { withTable } from '@/lib/supabaseTables';
import { warn as logWarn } from '@/lib/logger';

function isBrowserEnvironment() {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

const SESSION_HISTORY_LIMIT = 80;

function safeJsonParse(payload) {
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
}

function toTrimmed(value) {
  if (value === null || value === undefined) return '';
  const trimmed = String(value).trim();
  return trimmed;
}

function toOptionalTrimmed(value) {
  const trimmed = toTrimmed(value);
  return trimmed ? trimmed : null;
}

function toRoleKey(value) {
  const trimmed = toTrimmed(value);
  return trimmed ? trimmed.toLowerCase() : '';
}

function toBoolean(value) {
  if (value === true || value === false) return value;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const token = value.trim().toLowerCase();
    if (!token) return false;
    return ['true', '1', 'y', 'yes', 'on'].includes(token);
  }
  return Boolean(value);
}

function toNumber(value, fallback = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function cloneJson(value) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return null;
  }
}

function normalizeHistoryRow(row, fallbackIdx = 0) {
  if (!row) return null;

  const idx = toNumber(row?.idx, fallbackIdx);
  const role = toTrimmed(row?.role) || 'system';
  const content = typeof row?.content === 'string' ? row.content : '';
  const summaryPayload =
    row?.summary_payload && typeof row.summary_payload === 'object' ? row.summary_payload : null;

  return {
    id:
      row?.id != null
        ? String(row.id).trim() || null
        : row?.turn_id != null
          ? String(row.turn_id).trim() || null
          : null,
    idx: idx != null ? idx : fallbackIdx,
    role,
    content,
    public: row?.public !== false,
    isVisible: row?.is_visible !== false && row?.isVisible !== false,
    createdAt: row?.created_at || row?.createdAt || null,
    summaryPayload: summaryPayload ? cloneJson(summaryPayload) : null,
  };
}

async function fetchSessionHistorySnapshot(
  supabaseClient,
  sessionId,
  { limit = SESSION_HISTORY_LIMIT } = {}
) {
  const payload = {
    sessionId: sessionId || null,
    turns: [],
    totalCount: 0,
    publicCount: 0,
    hiddenCount: 0,
    suppressedCount: 0,
    truncated: false,
    lastIdx: null,
    updatedAt: Date.now(),
    source: 'rank_turns',
    diagnostics: null,
  };

  if (!sessionId) {
    payload.diagnostics = { error: 'missing_session_id' };
    return payload;
  }

  if (typeof supabaseClient?.from !== 'function') {
    payload.diagnostics = { error: 'supabase_from_unavailable' };
    return payload;
  }

  const { data, error, table } = await withTable(supabaseClient, 'rank_turns', tableName =>
    supabaseClient
      .from(tableName)
      .select('id, session_id, idx, role, public, is_visible, content, summary_payload, created_at')
      .eq('session_id', sessionId)
      .order('idx', { ascending: true })
      .limit(limit + 1)
  );

  if (error) {
    addSupabaseDebugEvent({
      source: 'match-ready-history',
      operation: 'rank_turns',
      error,
      level: 'error',
    });
    payload.diagnostics = {
      error,
      source: table || 'rank_turns',
    };
    return payload;
  }

  const rows = Array.isArray(data) ? data : [];
  const truncated = rows.length > limit;
  const limitedRows = truncated ? rows.slice(-limit) : rows;
  const turns = limitedRows.map((row, index) => normalizeHistoryRow(row, index)).filter(Boolean);

  payload.turns = turns;
  payload.totalCount = rows.length;
  payload.publicCount = rows.filter(row => row?.public !== false).length;
  payload.hiddenCount = rows.filter(row => row?.public === false).length;
  payload.suppressedCount = rows.filter(
    row => row?.public !== false && row?.is_visible === false
  ).length;
  payload.truncated = truncated;
  payload.lastIdx = turns.length ? turns[turns.length - 1].idx : null;

  if (truncated) {
    payload.diagnostics = {
      truncated: true,
      limit,
      fetched: rows.length,
    };
  }

  return payload;
}

function parseTimestamp(value) {
  if (!value && value !== 0) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.trunc(value);
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const direct = Number(trimmed);
    if (Number.isFinite(direct)) return Math.trunc(direct);
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) return null;
    return Math.trunc(parsed);
  }
  const coerced = Number(value);
  return Number.isFinite(coerced) ? Math.trunc(coerced) : null;
}

function deriveLatestSessionHint(payload = {}) {
  if (payload?.hintSuppressed) {
    return null;
  }

  const sourceError = payload.supabaseError || payload.error || null;
  const status = Number(payload.status);
  const code = String(sourceError?.code || '').toUpperCase();
  const merged = `${sourceError?.message || ''} ${sourceError?.details || ''} ${
    sourceError?.hint || ''
  }`
    .toLowerCase()
    .trim();

  if (code === '42809' || isOrderedSetAggregateError(sourceError)) {
    return [
      'fetch_latest_rank_session_v2 RPC에 ordered-set 집계를 사용할 때 WITHIN GROUP 절이 누락되어 있습니다.',
      'Supabase SQL Editor에서 percentile, mode와 같은 ordered-set 집계를 호출하는 구문에 `WITHIN GROUP (ORDER BY ...)` 절을 추가하고 docs/sql/fetch-latest-rank-session.sql 최신 버전을 재배포하세요.',
    ].join(' ');
  }

  if (status === 401 || status === 403) {
    return '세션을 불러오려면 Supabase 인증 토큰이 필요합니다. 브라우저에서 다시 로그인하거나 세션을 새로고침한 뒤 시도하세요.';
  }

  if (!code && !merged && payload?.hint) {
    return payload.hint;
  }

  if (payload?.circuitBreaker?.hint) {
    return payload.circuitBreaker.hint;
  }

  if (payload?.hint) {
    return payload.hint;
  }

  if (code === '42883' || code === '42P01' || merged.includes('does not exist')) {
    return [
      'fetch_latest_rank_session_v2 RPC가 배포되어 있지 않습니다.',
      'Supabase SQL Editor에서 `docs/sql/fetch-latest-rank-session.sql` 스크립트를 실행해 함수를 생성하고 GRANT 문으로 service_role과 authenticated 역할에 EXECUTE 권한을 부여하세요.',
    ].join(' ');
  }

  if (code === '42501' || merged.includes('permission denied')) {
    return [
      'fetch_latest_rank_session_v2 RPC 권한이 부족합니다.',
      'Supabase Dashboard에서 함수 권한을 확인하고 service_role 및 authenticated 역할에 EXECUTE 권한이 있는지 검증하세요.',
    ].join(' ');
  }

  if (code === 'PGRST301' || merged.includes('jwterror') || merged.includes('jwt expired')) {
    return [
      'Supabase 서비스 키 혹은 사용자 토큰이 유효하지 않아 최신 세션을 불러오지 못했습니다.',
      '환경 변수가 최신 anon/service 키를 가리키는지 확인하고, 필요한 경우 Supabase에서 키를 재발급해 배포하세요.',
    ].join(' ');
  }

  if (status === 502 || status === 500) {
    return [
      'Supabase RPC가 5xx 오류를 반환했습니다.',
      'Supabase SQL Editor에서 fetch_latest_rank_session_v2를 재배포하고, PostgREST 로그에서 추가 오류를 확인한 뒤 다시 시도하세요.',
    ].join(' ');
  }

  return null;
}

function normalizeRosterRow(row, fallbackIndex = 0) {
  const slotIndex = toNumber(row?.slot_index, fallbackIndex);
  const ownerId = toOptionalTrimmed(row?.owner_id);
  const heroId = toOptionalTrimmed(row?.hero_id);
  const heroSummary =
    row?.hero_summary && typeof row.hero_summary === 'object' ? row.hero_summary : null;
  const heroName =
    toTrimmed(row?.hero_name) ||
    (heroSummary && typeof heroSummary.name === 'string' ? heroSummary.name : '');
  const matchSource = toTrimmed(row?.match_source);
  const standin = row?.standin === true || matchSource === 'participant_pool';

  const score = row?.score !== undefined && row?.score !== null ? toNumber(row.score, null) : null;
  const rating =
    row?.rating !== undefined && row?.rating !== null ? toNumber(row.rating, null) : null;
  const battles =
    row?.battles !== undefined && row?.battles !== null ? toNumber(row.battles, null) : null;
  const winRate =
    row?.win_rate !== undefined && row?.win_rate !== null ? Number(row.win_rate) : null;
  const status = toTrimmed(row?.status);

  return {
    slotId: toOptionalTrimmed(row?.slot_id),
    slotIndex: slotIndex != null ? slotIndex : fallbackIndex,
    role: toTrimmed(row?.role) || '역할 미지정',
    ownerId: ownerId || '',
    heroId: heroId || '',
    heroName,
    ready: row?.ready === true,
    joinedAt: row?.joined_at || null,
    heroSummary,
    standin,
    matchSource: matchSource || '',
    score,
    rating,
    battles,
    winRate,
    status,
  };
}

function buildHeroMap(rows = []) {
  const map = {};
  rows.forEach(row => {
    const heroId = toOptionalTrimmed(row?.hero_id);
    if (!heroId) return;
    const summary =
      row?.hero_summary && typeof row.hero_summary === 'object' ? row.hero_summary : null;
    if (summary) {
      map[heroId] = summary;
    } else {
      const heroName = toTrimmed(row?.hero_name);
      if (heroName) {
        map[heroId] = { name: heroName };
      }
    }
  });
  return map;
}

function buildRoleGroups(roster = []) {
  const groups = new Map();
  roster.forEach(entry => {
    if (!entry) return;
    const roleKey = entry.role || '역할 미지정';
    if (!groups.has(roleKey)) {
      groups.set(roleKey, {
        role: roleKey,
        members: [],
      });
    }
    const bucket = groups.get(roleKey);
    bucket.members.push({
      ownerId: entry.ownerId,
      heroId: entry.heroId,
      heroName: entry.heroName,
      ready: entry.ready,
      slotIndex: entry.slotIndex,
      joinedAt: entry.joinedAt,
      standin: entry.standin === true,
      matchSource: entry.matchSource || '',
    });
  });
  return groups;
}

function buildAssignmentsFromGroups(groups) {
  return Array.from(groups.values()).map(group => ({
    role: group.role,
    members: group.members.map(member => ({ ...member })),
  }));
}

function buildRolesFromGroups(groups) {
  return Array.from(groups.values()).map(group => ({
    role: group.role,
    slots: group.members.length,
    members: group.members.map(member => ({ ...member })),
  }));
}

function buildSlotLayoutFromRoster(roster = []) {
  return roster.map(entry => ({
    slotId: entry.slotId,
    slotIndex: entry.slotIndex,
    slot_index: entry.slotIndex,
    role: entry.role,
    ownerId: entry.ownerId,
    owner_id: entry.ownerId,
    heroId: entry.heroId,
    hero_id: entry.heroId,
    heroName: entry.heroName,
    ready: entry.ready,
    joinedAt: entry.joinedAt,
    occupant_owner_id: entry.ownerId || null,
    occupant_hero_id: entry.heroId || null,
    occupant_ready: entry.ready || false,
    occupant_joined_at: entry.joinedAt || null,
    active: true,
  }));
}

function buildParticipantPool(roster = []) {
  return roster.map(entry => ({
    slotIndex: entry.slotIndex,
    role: entry.role,
    ownerId: entry.ownerId,
    heroId: entry.heroId,
    heroName: entry.heroName,
    ready: entry.ready,
    joinedAt: entry.joinedAt,
    standin: entry.standin === true,
    matchSource: entry.matchSource || (entry.standin ? 'participant_pool' : ''),
  }));
}

function normalizeAsyncFillCandidate(candidate, index = 0) {
  if (!candidate || typeof candidate !== 'object') return null;
  const ownerId = toOptionalTrimmed(candidate.ownerId ?? candidate.owner_id);
  const heroId = toOptionalTrimmed(candidate.heroId ?? candidate.hero_id);
  const heroName = toTrimmed(candidate.heroName ?? candidate.hero_name);
  const role = toTrimmed(candidate.role ?? candidate.roleName);
  const joinedRaw = candidate.joinedAt ?? candidate.joined_at ?? null;
  const joinedAt =
    typeof joinedRaw === 'string' && joinedRaw
      ? joinedRaw
      : joinedRaw instanceof Date
        ? new Date(joinedRaw).toISOString()
        : joinedRaw != null && Number.isFinite(Number(joinedRaw))
          ? new Date(Number(joinedRaw)).toISOString()
          : null;
  const matchSource = toTrimmed(candidate.matchSource ?? candidate.match_source);
  const placeholderOwnerId = toOptionalTrimmed(
    candidate.placeholderOwnerId ?? candidate.placeholder_owner_id
  );
  const placeholder = candidate.placeholder === true;

  return {
    ownerId,
    heroId,
    heroName,
    role,
    joinedAt,
    score: candidate.score !== undefined ? toNumber(candidate.score, null) : null,
    rating: candidate.rating !== undefined ? toNumber(candidate.rating, null) : null,
    battles: candidate.battles !== undefined ? toNumber(candidate.battles, null) : null,
    winRate:
      candidate.winRate !== undefined && candidate.winRate !== null
        ? Number(candidate.winRate)
        : candidate.win_rate !== undefined && candidate.win_rate !== null
          ? Number(candidate.win_rate)
          : null,
    status: toTrimmed(candidate.status),
    matchSource,
    placeholderOwnerId,
    placeholder,
    index,
    raw: cloneJson(candidate),
  };
}

function deriveAsyncFillVacancyIndexes(asyncFill, rosterList = []) {
  if (!asyncFill) return [];

  const rosterIndexMap = new Map();
  rosterList.forEach(entry => {
    if (!entry || entry.slotIndex == null) return;
    rosterIndexMap.set(Number(entry.slotIndex), entry);
  });

  const vacancySet = new Set(
    Array.isArray(asyncFill.pendingSeatIndexes)
      ? asyncFill.pendingSeatIndexes
          .map(value => Number(value))
          .filter(value => Number.isFinite(value) && value >= 0)
      : []
  );

  if (Array.isArray(asyncFill.seatIndexes)) {
    asyncFill.seatIndexes
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value >= 0)
      .forEach(seatIndex => {
        const seat = rosterIndexMap.get(seatIndex);
        const occupiedOwner = toOptionalTrimmed(seat?.ownerId);
        if (!occupiedOwner) {
          vacancySet.add(seatIndex);
        }
      });
  }

  return Array.from(vacancySet).sort((a, b) => a - b);
}

function buildRoleAverages(rosterList = []) {
  const aggregates = new Map();
  rosterList.forEach(entry => {
    if (!entry) return;
    const roleKey = toRoleKey(entry.role);
    const ownerId = toOptionalTrimmed(entry.ownerId);
    if (!roleKey || !ownerId) return;
    if (!aggregates.has(roleKey)) {
      aggregates.set(roleKey, {
        scoreTotal: 0,
        scoreCount: 0,
        ratingTotal: 0,
        ratingCount: 0,
      });
    }
    const aggregate = aggregates.get(roleKey);
    const score =
      entry.score !== undefined && entry.score !== null ? toNumber(entry.score, null) : null;
    if (score !== null) {
      aggregate.scoreTotal += score;
      aggregate.scoreCount += 1;
    }
    const rating =
      entry.rating !== undefined && entry.rating !== null ? toNumber(entry.rating, null) : null;
    if (rating !== null) {
      aggregate.ratingTotal += rating;
      aggregate.ratingCount += 1;
    }
  });
  return aggregates;
}

function buildAsyncFillSeatRequests({ rosterList = [], asyncFill = null, hostRole = '' }) {
  if (!asyncFill) return [];
  const vacancies = deriveAsyncFillVacancyIndexes(asyncFill, rosterList);
  if (!vacancies.length) return [];

  const rosterIndexMap = new Map();
  rosterList.forEach(entry => {
    if (!entry || entry.slotIndex == null) return;
    rosterIndexMap.set(Number(entry.slotIndex), entry);
  });

  const roleAverages = buildRoleAverages(rosterList);

  return vacancies.map(seatIndex => {
    const seatEntry = rosterIndexMap.get(seatIndex) || null;
    const seatRoleRaw = seatEntry?.role || asyncFill.hostRole || hostRole || '역할 미지정';
    const seatRoleKey = toRoleKey(seatRoleRaw);
    const isGenericRole =
      !seatRoleKey ||
      seatRoleKey === '역할 미지정' ||
      seatRoleKey === '미지정' ||
      seatRoleKey === 'unassigned' ||
      seatRoleKey === 'none' ||
      seatRoleKey === 'any';
    const seatRoleForRpc = isGenericRole ? null : seatRoleRaw;
    const referenceScore =
      seatEntry && seatEntry.score !== undefined && seatEntry.score !== null
        ? toNumber(seatEntry.score, null)
        : seatRoleKey && roleAverages.has(seatRoleKey)
          ? (() => {
              const aggregate = roleAverages.get(seatRoleKey);
              if (!aggregate || !aggregate.scoreCount) return null;
              return Math.round(aggregate.scoreTotal / aggregate.scoreCount);
            })()
          : null;
    const referenceRating =
      seatEntry && seatEntry.rating !== undefined && seatEntry.rating !== null
        ? toNumber(seatEntry.rating, null)
        : seatRoleKey && roleAverages.has(seatRoleKey)
          ? (() => {
              const aggregate = roleAverages.get(seatRoleKey);
              if (!aggregate || !aggregate.ratingCount) return null;
              return Math.round(aggregate.ratingTotal / aggregate.ratingCount);
            })()
          : null;

    return {
      slotIndex: seatIndex,
      role: seatRoleForRpc,
      score: referenceScore,
      rating: referenceRating,
    };
  });
}

async function fetchAsyncStandinQueueViaApi({ gameId, roomId, seatRequests, excludeOwnerIds }) {
  if (typeof fetch !== 'function') {
    return null;
  }

  const payload = {
    game_id: gameId,
    room_id: roomId || null,
    seat_requests: seatRequests,
  };

  if (Array.isArray(excludeOwnerIds) && excludeOwnerIds.length) {
    payload.exclude_owner_ids = excludeOwnerIds;
  }

  try {
    const response = await fetch('/api/rank/async-standins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text().catch(() => '');
    const data = safeJsonParse(text) || {};

    if (!response.ok) {
      addDebugEvent({
        level: 'warn',
        source: 'async-standin-api',
        message: 'Async stand-in API request failed',
        details: {
          status: response.status,
          error: data?.error || null,
          hint: data?.hint || null,
        },
      });
      return null;
    }

    if (Array.isArray(data.queue) && data.queue.length) {
      return data.queue;
    }

    return [];
  } catch (error) {
    addDebugEvent({
      level: 'error',
      source: 'async-standin-api',
      message: 'Async stand-in API request threw',
      details: { message: error?.message || 'unknown_error' },
    });
    return null;
  }
}

function buildStandinPriority(seatEntry, candidate) {
  const seatRoleKey = toRoleKey(seatEntry?.role);
  const candidateRoleKey = toRoleKey(candidate?.role);

  let rolePenalty = 0;
  if (seatRoleKey) {
    if (!candidateRoleKey) {
      rolePenalty = 2;
    } else if (candidateRoleKey !== seatRoleKey) {
      rolePenalty = 1;
    }
  }

  const seatRating =
    seatEntry?.rating !== undefined && seatEntry?.rating !== null
      ? toNumber(seatEntry.rating, null)
      : null;
  const candidateRating =
    candidate?.rating !== undefined && candidate?.rating !== null
      ? toNumber(candidate.rating, null)
      : null;
  const seatScore =
    seatEntry?.score !== undefined && seatEntry?.score !== null
      ? toNumber(seatEntry.score, null)
      : null;
  const candidateScore =
    candidate?.score !== undefined && candidate?.score !== null
      ? toNumber(candidate.score, null)
      : null;

  let statsPenalty = 2;
  let diffValue = Number.POSITIVE_INFINITY;
  if (seatRating != null && candidateRating != null) {
    statsPenalty = 0;
    diffValue = Math.abs(seatRating - candidateRating);
  } else if (seatScore != null && candidateScore != null) {
    statsPenalty = 1;
    diffValue = Math.abs(seatScore - candidateScore);
  }

  const queueIndex = candidate?.index != null ? candidate.index : Number.MAX_SAFE_INTEGER;

  return [rolePenalty, statsPenalty, diffValue, queueIndex];
}

function compareStandinPriority(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  const normalize = value => (Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = normalize(a[i] ?? Number.MAX_SAFE_INTEGER);
    const right = normalize(b[i] ?? Number.MAX_SAFE_INTEGER);
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return 0;
}

function applyAsyncFillStandins({ roster, sessionMeta, heroMap }) {
  const rosterList = Array.isArray(roster) ? roster.map(entry => ({ ...entry })) : [];
  const asyncFill = sessionMeta?.asyncFill;
  const mode = toTrimmed(asyncFill?.mode).toLowerCase();
  if (!asyncFill || (mode && mode !== 'off')) {
    return { roster, sessionMeta, heroMap, applied: false };
  }

  const pendingSeatIndexes = Array.isArray(asyncFill.pendingSeatIndexes)
    ? asyncFill.pendingSeatIndexes
        .map(value => Number(value))
        .filter(value => Number.isFinite(value) && value >= 0)
    : [];
  const seatIndexes = Array.isArray(asyncFill.seatIndexes)
    ? asyncFill.seatIndexes
        .map(value => Number(value))
        .filter(value => Number.isFinite(value) && value >= 0)
    : [];
  const queueCandidates = Array.isArray(asyncFill.fillQueue)
    ? asyncFill.fillQueue
        .map((candidate, index) => normalizeAsyncFillCandidate(candidate, index))
        .filter(
          candidate => candidate && (candidate.ownerId || candidate.heroId || candidate.heroName)
        )
    : [];

  if (!queueCandidates.length) {
    return { roster, sessionMeta, heroMap, applied: false };
  }

  const rosterIndexMap = new Map();
  rosterList.forEach((entry, listIndex) => {
    rosterIndexMap.set(entry.slotIndex, { entry, listIndex });
  });

  const vacancySet = new Set(pendingSeatIndexes);
  seatIndexes.forEach(seatIndex => {
    const seat = rosterIndexMap.get(seatIndex);
    const occupiedOwner = toOptionalTrimmed(seat?.entry?.ownerId);
    if (!occupiedOwner) {
      vacancySet.add(seatIndex);
    }
  });

  if (!vacancySet.size) {
    return { roster, sessionMeta, heroMap, applied: false };
  }

  const heroMapClone = heroMap ? { ...heroMap } : {};
  const usedQueueIndexes = new Set();
  const assignedSeats = [];
  const assignedEntries = [];
  const collaboratorIds = new Set();

  rosterList.forEach(entry => {
    const ownerId = toOptionalTrimmed(entry?.ownerId);
    if (ownerId) {
      collaboratorIds.add(ownerId);
    }
  });

  const hostRole = toTrimmed(asyncFill.hostRole) || '역할 미지정';

  Array.from(vacancySet)
    .sort((a, b) => a - b)
    .forEach(seatIndexRaw => {
      const seatIndex = Number(seatIndexRaw);
      if (!Number.isFinite(seatIndex) || seatIndex < 0) return;
      let seat = rosterIndexMap.get(seatIndex);

      if (!seat) {
        const placeholderEntry = {
          slotId: null,
          slotIndex: seatIndex,
          role: hostRole,
          ownerId: '',
          heroId: '',
          heroName: '',
          ready: false,
          joinedAt: null,
          heroSummary: null,
          standin: false,
          matchSource: '',
          score: null,
          rating: null,
          battles: null,
          winRate: null,
          status: 'vacant',
        };

        rosterList.push(placeholderEntry);
        seat = { entry: placeholderEntry, listIndex: rosterList.length - 1 };
        rosterIndexMap.set(seatIndex, seat);
      }

      if (seat.entry.ownerId) return;
      let bestCandidate = null;
      let bestPriority = null;
      queueCandidates.forEach(candidate => {
        if (usedQueueIndexes.has(candidate.index)) return;
        const priority = buildStandinPriority(seat.entry, candidate);
        if (!bestCandidate || compareStandinPriority(priority, bestPriority) < 0) {
          bestCandidate = candidate;
          bestPriority = priority;
        }
      });
      const candidate = bestCandidate;
      if (!candidate) return;

      usedQueueIndexes.add(candidate.index);
      assignedSeats.push(seatIndex);
      const isPlaceholder = candidate.placeholder === true;
      const resolvedOwnerId =
        candidate.ownerId && !isPlaceholder
          ? candidate.ownerId
          : toOptionalTrimmed(seat.entry.ownerId) || null;

      if (candidate.ownerId && !isPlaceholder) {
        collaboratorIds.add(candidate.ownerId);
      }

      const resolvedMatchSource = isPlaceholder
        ? 'async_standin_placeholder'
        : candidate.matchSource || 'participant_pool';

      const updatedEntry = {
        ...seat.entry,
        ownerId:
          resolvedOwnerId || candidate.placeholderOwnerId || seat.entry.placeholderOwnerId || null,
        placeholderOwnerId:
          candidate.placeholderOwnerId ||
          seat.entry.placeholderOwnerId ||
          (isPlaceholder ? candidate.ownerId : null) ||
          null,
        heroId: candidate.heroId || seat.entry.heroId || '',
        heroName: candidate.heroName || seat.entry.heroName || '비실시간 대역',
        role: seat.entry.role || candidate.role || '역할 미지정',
        ready: true,
        joinedAt: candidate.joinedAt || seat.entry.joinedAt || null,
        standin: true,
        matchSource: resolvedMatchSource,
        score: candidate.score ?? seat.entry.score ?? null,
        rating: candidate.rating ?? seat.entry.rating ?? null,
        battles: candidate.battles ?? seat.entry.battles ?? null,
        winRate: candidate.winRate ?? seat.entry.winRate ?? null,
        status: candidate.status || seat.entry.status || 'standin',
        standinPlaceholder: isPlaceholder || seat.entry.standinPlaceholder === true,
      };

      rosterList[seat.listIndex] = updatedEntry;
      rosterIndexMap.set(seatIndex, { entry: updatedEntry, listIndex: seat.listIndex });

      if (candidate.heroId && candidate.heroName) {
        const existing = heroMapClone[candidate.heroId] || {};
        heroMapClone[candidate.heroId] = { ...existing, name: existing.name || candidate.heroName };
      }

      assignedEntries.push({
        slotIndex: seatIndex,
        slotId: updatedEntry.slotId || null,
        ownerId: updatedEntry.ownerId || null,
        placeholderOwnerId: updatedEntry.placeholderOwnerId || null,
        heroId: updatedEntry.heroId || null,
        heroName: updatedEntry.heroName || null,
        role: updatedEntry.role || null,
        ready: true,
        joinedAt: updatedEntry.joinedAt || null,
        score: updatedEntry.score ?? null,
        rating: updatedEntry.rating ?? null,
        matchSource: updatedEntry.matchSource || null,
        placeholder: updatedEntry.standinPlaceholder === true,
      });
    });

  if (!assignedEntries.length) {
    return { roster, sessionMeta, heroMap, applied: false };
  }

  const asyncFillClone = cloneJson(asyncFill) || {};
  const pendingSet = new Set(
    Array.isArray(asyncFillClone.pendingSeatIndexes)
      ? asyncFillClone.pendingSeatIndexes
          .map(value => Number(value))
          .filter(value => Number.isFinite(value) && value >= 0)
      : []
  );
  vacancySet.forEach(seatIndex => pendingSet.add(seatIndex));
  assignedSeats.forEach(seatIndex => pendingSet.delete(seatIndex));
  asyncFillClone.pendingSeatIndexes = Array.from(pendingSet).sort((a, b) => a - b);

  const existingAssigned = Array.isArray(asyncFillClone.assigned)
    ? asyncFillClone.assigned.filter(entry => entry && typeof entry === 'object')
    : [];
  asyncFillClone.assigned = existingAssigned.concat(assignedEntries);

  asyncFillClone.fillQueue = queueCandidates
    .filter(candidate => !usedQueueIndexes.has(candidate.index))
    .map(candidate => candidate.raw || null)
    .filter(Boolean);

  rosterList.sort((left, right) => {
    const leftIndex = Number.isFinite(left.slotIndex) ? left.slotIndex : Number.MAX_SAFE_INTEGER;
    const rightIndex = Number.isFinite(right.slotIndex) ? right.slotIndex : Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    const leftJoined = toTrimmed(left.joinedAt);
    const rightJoined = toTrimmed(right.joinedAt);
    if (leftJoined && rightJoined) {
      return leftJoined.localeCompare(rightJoined);
    }
    if (leftJoined) return -1;
    if (rightJoined) return 1;
    return 0;
  });

  const updatedSessionMeta = sessionMeta
    ? { ...sessionMeta, asyncFill: asyncFillClone }
    : { asyncFill: asyncFillClone, source: 'async-fill-standin' };

  return {
    roster: rosterList,
    sessionMeta: updatedSessionMeta,
    heroMap: heroMapClone,
    applied: true,
    collaborators: Array.from(collaboratorIds),
  };
}

function formatRoom(row) {
  if (!row || typeof row !== 'object') return null;
  const ownerId = toOptionalTrimmed(row.owner_id);
  return {
    id: toOptionalTrimmed(row.id),
    code: toTrimmed(row.code),
    status: toTrimmed(row.status),
    mode: toTrimmed(row.mode),
    realtimeMode: toTrimmed(row.realtime_mode),
    hostRoleLimit: row.host_role_limit != null ? Number(row.host_role_limit) : null,
    blindMode: toBoolean(row.blind_mode),
    scoreWindow: row.score_window != null ? Number(row.score_window) : null,
    updatedAt: row.updated_at || null,
    ownerId,
    owner_id: ownerId,
  };
}

function formatSessionRow(row) {
  if (!row || typeof row !== 'object') return null;
  const id = toOptionalTrimmed(row.id);
  if (!id) return null;
  const ownerId = toOptionalTrimmed(row.owner_id ?? row.ownerId);
  const matchMode = toTrimmed(row.match_mode ?? row.matchMode ?? row.mode);
  return {
    id,
    status: toTrimmed(row.status),
    owner_id: ownerId,
    ownerId,
    created_at: row.created_at ?? row.createdAt ?? null,
    updated_at: row.updated_at ?? row.updatedAt ?? null,
    mode: matchMode,
    match_mode: matchMode,
  };
}

async function fetchSessionViaApi(gameId, ownerId) {
  if (!isBrowserEnvironment() || typeof fetch !== 'function') return null;
  const body = { game_id: gameId };
  if (ownerId) {
    body.owner_id = ownerId;
  }

  try {
    const response = await fetch('/api/rank/latest-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = safeJsonParse(text) || {};

    const failure = {
      status: response.status,
      error: data?.error,
      message: data?.message,
      details: data?.details,
      hint: data?.hint,
      supabaseError: data?.supabaseError,
      fallbackError: data?.fallbackError,
      via: data?.via,
      circuitBreaker: data?.circuitBreaker || (data?.diagnostics?.circuitBreaker ?? null),
    };

    const diagnostics =
      data?.diagnostics && typeof data.diagnostics === 'object' ? { ...data.diagnostics } : null;

    const formatted = data?.session ? formatSessionRow(data.session) : null;
    const mergedVia = diagnostics?.via || failure.via;
    const fallbackSuccess =
      response.ok &&
      Boolean(formatted) &&
      typeof mergedVia === 'string' &&
      mergedVia.toLowerCase().startsWith('table');

    if (fallbackSuccess) {
      const mergedDiagnostics = {
        ...failure,
        ...(diagnostics || {}),
        via: mergedVia,
      };
      const derivedHint = deriveLatestSessionHint(mergedDiagnostics);
      if (
        failure.error ||
        failure.supabaseError ||
        failure.fallbackError ||
        failure.hint ||
        diagnostics?.hint
      ) {
        if (typeof console !== 'undefined' && typeof console.info === 'function') {
          console.info(
            '[matchRealtimeSync] latest-session API recovered via table fallback:',
            mergedDiagnostics
          );
        }
        addSupabaseDebugEvent({
          source: 'latest-session-api',
          operation: 'fetch_latest_rank_session_v2',
          status: response.status,
          error: mergedDiagnostics.supabaseError || mergedDiagnostics.error || null,
          payload: { request: body, response: mergedDiagnostics },
          hint: derivedHint || mergedDiagnostics.hint || null,
          level: 'info',
        });
      }

      return {
        session: formatted,
        error: null,
        hint: derivedHint || mergedDiagnostics.hint || null,
        diagnostics: mergedDiagnostics,
      };
    }

    const hasDiagnostics =
      !response.ok ||
      Boolean(failure.error) ||
      Boolean(failure.supabaseError) ||
      Boolean(failure.fallbackError) ||
      Boolean(failure.hint);

    if (hasDiagnostics) {
      const derivedHint = deriveLatestSessionHint(failure);

      logWarn('[matchRealtimeSync] latest-session API failed:', failure);

      addSupabaseDebugEvent({
        source: 'latest-session-api',
        operation: 'fetch_latest_rank_session_v2',
        status: response.status,
        error: failure.supabaseError || failure.error || data,
        payload: { request: body, response: failure },
        hint: derivedHint || failure.hint || null,
      });

      return { session: formatted, error: failure, hint: derivedHint || failure.hint || null };
    }

    return { session: formatted, error: null, hint: null };
  } catch (error) {
    logWarn('[matchRealtimeSync] latest-session API threw:', error);
    addDebugEvent({
      level: 'error',
      source: 'latest-session-api',
      message: 'Latest session API request threw an exception',
      details: { message: error?.message || 'unknown_error' },
    });
    return { session: null, error, hint: deriveLatestSessionHint({ error }) };
  }

  return { session: null, error: null, hint: null };
}

function isRpcMissing(error) {
  if (!error) return false;
  const code = String(error.code || '').toUpperCase();
  if (!code || code === 'NULL') {
    const merged = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    return merged.includes('not exist') || merged.includes('missing');
  }
  return ['42883', '42P01', 'PGRST100', 'PGRST204', 'PGRST301'].includes(code);
}

export async function fetchLatestSessionRow(supabaseClient, gameId, options = {}) {
  const trimmedGameId = toTrimmed(gameId);
  if (!trimmedGameId) {
    return null;
  }

  const ownerId = options.ownerId ? toTrimmed(options.ownerId) : null;
  const emitDiagnostics =
    typeof options.onDiagnostics === 'function' ? options.onDiagnostics : null;
  const report = payload => {
    if (!emitDiagnostics) return;
    try {
      emitDiagnostics(payload);
    } catch (error) {
      logWarn('[matchRealtimeSync] latest-session diagnostics handler failed:', error);
    }
  };

  if (isBrowserEnvironment()) {
    const viaApi = await fetchSessionViaApi(trimmedGameId, ownerId);
    if (viaApi?.session) {
      if (viaApi.hint) {
        report({ source: 'latest-session-api', hint: viaApi.hint, error: null });
      }
      return viaApi.session;
    }
    if (viaApi?.hint || viaApi?.error) {
      report({
        source: 'latest-session-api',
        hint: viaApi?.hint || null,
        error: viaApi?.error || null,
      });
    }
    return null;
  }

  const rpcPayload = ownerId
    ? { p_game_id: trimmedGameId, p_owner_id: ownerId }
    : { p_game_id: trimmedGameId };

  if (typeof supabaseClient?.rpc === 'function') {
    try {
      const { data: rpcData, error: rpcError } = await supabaseClient.rpc(
        'fetch_latest_rank_session_v2',
        rpcPayload
      );

      if (!rpcError && rpcData) {
        const payload = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        const formatted = formatSessionRow(payload);
        if (formatted) {
          return formatted;
        }
      }

      if (rpcError?.code === 'PGRST203') {
        logWarn(
          '[matchRealtimeSync] fetch_latest_rank_session_v2 RPC ambiguous (PGRST203); please drop legacy overloads',
          rpcError
        );
      } else if (!isRpcMissing(rpcError)) {
        logWarn('[matchRealtimeSync] fetch_latest_rank_session_v2 RPC failed:', rpcError);
      }

      const hint = deriveLatestSessionHint({ supabaseError: rpcError });
      if (hint) {
        report({ source: 'fetch_latest_rank_session_v2', hint, error: rpcError });
      }
    } catch (rpcException) {
      logWarn('[matchRealtimeSync] fetch_latest_rank_session_v2 RPC threw:', rpcException);
      const hint = deriveLatestSessionHint({ error: rpcException });
      if (hint) {
        report({ source: 'fetch_latest_rank_session_v2', hint, error: rpcException });
      }
    }
  }

  logWarn(
    '[matchRealtimeSync] fetch_latest_rank_session_v2 RPC unavailable; returning null to avoid legacy rank_sessions query'
  );
  const fallbackHint = deriveLatestSessionHint({});
  if (fallbackHint) {
    report({ source: 'fetch_latest_rank_session_v2', hint: fallbackHint, error: null });
  }
  return null;
}

function mapSessionMeta(row) {
  if (!row || typeof row !== 'object') return null;
  const payload = {};
  const updatedAt = parseTimestamp(row.updated_at) || Date.now();

  if (row.selected_time_limit_seconds != null) {
    payload.turnTimer = {
      baseSeconds: Number(row.selected_time_limit_seconds) || 0,
      updatedAt,
      source: 'supabase',
    };
  }

  if (row.time_vote) {
    payload.vote = {
      turnTimer: row.time_vote,
    };
  }

  if (row.drop_in_bonus_seconds != null) {
    payload.dropIn = {
      bonusSeconds: Number(row.drop_in_bonus_seconds) || 0,
      updatedAt,
    };
  }

  if (row.async_fill_snapshot) {
    payload.asyncFill = row.async_fill_snapshot;
  }

  if (row.turn_state) {
    payload.turnState = row.turn_state;
  }

  if (row.extras) {
    payload.extras = row.extras;
  }

  if (row.realtime_mode) {
    payload.realtimeMode = row.realtime_mode;
  }

  if (Object.keys(payload).length === 0) {
    return null;
  }

  return {
    ...payload,
    source: 'supabase',
    updatedAt,
  };
}

function isOrderedSetAggregateError(error) {
  if (!error) return false;
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return message.includes('ordered-set') && message.includes('within group');
}

function isSnapshotReturnTypeMismatch(error) {
  if (!error) return false;
  const code = typeof error.code === 'string' ? error.code.toUpperCase() : '';
  if (code === '42P13') {
    return true;
  }
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return message.includes('return type mismatch') && message.includes('jsonb');
}

function createOrderedSetAggregateException(error, context = {}) {
  const exception = new Error(
    'ordered-set 집계를 사용하는 Supabase 함수에 WITHIN GROUP 절이 빠져 있어 매치 준비 스냅샷을 불러오지 못했습니다.'
  );
  exception.code = 'ordered_set_aggregate';
  exception.supabaseError = error || null;
  exception.hint = [
    'Supabase SQL에서 percentile, mode와 같은 ordered-set 집계를 호출할 때는 `WITHIN GROUP (ORDER BY ...)` 절이 필요합니다.',
    'fetch_rank_match_ready_snapshot 혹은 관련 RPC/뷰에서 누락된 WITHIN GROUP 절을 추가한 뒤 다시 시도하세요.',
  ].join(' ');
  exception.context = context;
  return exception;
}

function createSnapshotReturnTypeMismatchException(error, context = {}) {
  const exception = new Error(
    'fetch_rank_match_ready_snapshot RPC 본문이 jsonb를 반환하지 않아 매치 준비 스냅샷을 불러오지 못했습니다.'
  );
  exception.code = 'snapshot_return_type_mismatch';
  exception.supabaseError = error || null;
  exception.hint = [
    'Supabase 함수의 마지막 구문이 jsonb를 반환하는 SELECT가 아니어서 42P13 오류가 발생했습니다.',
    '`docs/sql/fetch-rank-match-ready-snapshot.sql`에 있는 최신 PL/pgSQL 버전을 배포하고 GRANT 문까지 실행했는지 확인하세요.',
  ].join(' ');
  exception.context = context;
  return exception;
}

function isSnapshotSyntaxError(error) {
  if (!error) return false;
  const code = typeof error.code === 'string' ? error.code.toUpperCase() : '';
  if (code === '42601') {
    return true;
  }
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  if (!message.includes('syntax error')) {
    return false;
  }
  return message.includes('near') || message.includes('line');
}

function createSnapshotSyntaxException(error, context = {}) {
  const exception = new Error(
    'fetch_rank_match_ready_snapshot RPC SQL 정의에 문법 오류가 있어 매치 준비 스냅샷을 불러오지 못했습니다.'
  );
  exception.code = 'snapshot_sql_syntax_error';
  exception.supabaseError = error || null;
  exception.hint = [
    'Supabase SQL Editor에서 RPC 본문이 잘렸거나 붙여넣기 도중 문법이 손상되지 않았는지 확인하세요.',
    '`docs/sql/fetch-rank-match-ready-snapshot.sql` 파일의 전체 내용을 그대로 복사해 붙여넣고, `...` 같은 플레이스홀더가 포함되지 않았는지 검증하세요.',
    '배포 후 RPC를 다시 호출해 SUBSCRIBED 상태와 스냅샷 수신이 정상인지 Match Ready 진단 패널에서 확인하세요.',
  ].join(' ');
  exception.context = context;
  return exception;
}

function normaliseSnapshotEnvelope(envelope) {
  if (!envelope) return null;
  const payload = Array.isArray(envelope) ? envelope[0] : envelope;
  if (!payload || typeof payload !== 'object') return null;
  return payload;
}

export async function loadMatchFlowSnapshot(supabaseClient, gameId) {
  const trimmedGameId = toTrimmed(gameId);
  if (!trimmedGameId) {
    return null;
  }

  let rosterData = null;
  let rosterError = null;
  let rosterEnvelope = null;
  let slotTemplateVersionOverride = null;
  let slotTemplateUpdatedAtOverride = null;
  let slotTemplateSourceOverride = null;
  let roomEnvelope = null;
  let sessionEnvelope = null;
  let sessionMetaEnvelope = null;

  if (typeof supabaseClient?.rpc === 'function') {
    try {
      const { data: rpcData, error: rpcError } = await supabaseClient.rpc(
        'fetch_rank_match_ready_snapshot',
        { p_game_id: trimmedGameId }
      );

      if (rpcError) {
        if (isSnapshotReturnTypeMismatch(rpcError)) {
          addSupabaseDebugEvent({
            source: 'match-ready-snapshot',
            operation: 'fetch_rank_match_ready_snapshot',
            error: rpcError,
            level: 'error',
          });
          throw createSnapshotReturnTypeMismatchException(rpcError, {
            operation: 'fetch_rank_match_ready_snapshot',
          });
        }

        if (isSnapshotSyntaxError(rpcError)) {
          addSupabaseDebugEvent({
            source: 'match-ready-snapshot',
            operation: 'fetch_rank_match_ready_snapshot',
            error: rpcError,
            level: 'error',
          });
          throw createSnapshotSyntaxException(rpcError, {
            operation: 'fetch_rank_match_ready_snapshot',
          });
        }

        if (isOrderedSetAggregateError(rpcError)) {
          addSupabaseDebugEvent({
            source: 'match-ready-snapshot',
            operation: 'fetch_rank_match_ready_snapshot',
            error: rpcError,
            level: 'error',
          });
          throw createOrderedSetAggregateException(rpcError, {
            operation: 'fetch_rank_match_ready_snapshot',
          });
        }

        addSupabaseDebugEvent({
          source: 'match-ready-snapshot',
          operation: 'fetch_rank_match_ready_snapshot',
          error: rpcError,
        });
      }

      const envelope = normaliseSnapshotEnvelope(rpcData);
      if (envelope) {
        rosterEnvelope = envelope;
        rosterData = Array.isArray(envelope.roster) ? envelope.roster : [];
        slotTemplateVersionOverride = envelope.slot_template_version ?? null;
        slotTemplateUpdatedAtOverride = envelope.slot_template_updated_at ?? null;
        slotTemplateSourceOverride = envelope.slot_template_source ?? null;
        roomEnvelope = envelope.room || null;
        sessionEnvelope = envelope.session || null;
        sessionMetaEnvelope = envelope.session_meta || null;
      }
    } catch (rpcException) {
      if (
        rpcException?.code === 'ordered_set_aggregate' ||
        rpcException?.code === 'snapshot_return_type_mismatch' ||
        rpcException?.code === 'snapshot_sql_syntax_error'
      ) {
        throw rpcException;
      }

      if (isOrderedSetAggregateError(rpcException)) {
        throw createOrderedSetAggregateException(rpcException, {
          operation: 'fetch_rank_match_ready_snapshot',
        });
      }

      if (isSnapshotReturnTypeMismatch(rpcException)) {
        throw createSnapshotReturnTypeMismatchException(rpcException, {
          operation: 'fetch_rank_match_ready_snapshot',
        });
      }

      if (isSnapshotSyntaxError(rpcException)) {
        throw createSnapshotSyntaxException(rpcException, {
          operation: 'fetch_rank_match_ready_snapshot',
        });
      }
      addSupabaseDebugEvent({
        source: 'match-ready-snapshot',
        operation: 'fetch_rank_match_ready_snapshot',
        error: rpcException,
        level: 'error',
        message: 'Snapshot RPC threw an exception',
      });
    }
  }

  if (!rosterData) {
    const result = await withTable(supabaseClient, 'rank_match_roster', table =>
      supabaseClient
        .from(table)
        .select(
          'id, match_instance_id, room_id, slot_index, slot_id, role, owner_id, hero_id, hero_name, hero_summary, ready, joined_at, slot_template_version, slot_template_source, slot_template_updated_at, updated_at, created_at, game_id, score, rating, battles, win_rate, status, standin, match_source'
        )
        .eq('game_id', trimmedGameId)
        .order('slot_template_version', { ascending: false })
        .order('slot_index', { ascending: true })
    );

    rosterData = result.data;
    rosterError = result.error;
  }

  if (rosterError) {
    throw rosterError;
  }

  let fallbackSessionRow = null;
  if (!Array.isArray(rosterData) || rosterData.length === 0) {
    const sessionDiagnostics = {
      hint: null,
      error: null,
      source: null,
    };

    fallbackSessionRow = await fetchLatestSessionRow(supabaseClient, trimmedGameId, {
      onDiagnostics: info => {
        if (!info || typeof info !== 'object') return;
        const derivedHint = info.hint || deriveLatestSessionHint(info) || null;
        if (derivedHint && !sessionDiagnostics.hint) {
          sessionDiagnostics.hint = derivedHint;
        }
        if (info.error && !sessionDiagnostics.error) {
          sessionDiagnostics.error = info.error;
        }
        if (info.source && !sessionDiagnostics.source) {
          sessionDiagnostics.source = info.source;
        }
      },
    });

    const hasAsyncFill = Boolean(sessionMetaEnvelope?.async_fill_snapshot);

    if (!hasAsyncFill) {
      if (!fallbackSessionRow && (sessionDiagnostics.hint || sessionDiagnostics.error)) {
        const fallbackHint =
          sessionDiagnostics.hint ||
          deriveLatestSessionHint({
            error: sessionDiagnostics.error,
            supabaseError: sessionDiagnostics.error,
          }) ||
          'fetch_latest_rank_session_v2 RPC를 호출하지 못했습니다. Supabase SQL Editor에서 함수를 재배포하고 권한을 확인하세요.';
        const exception = new Error('매치 세션 정보를 불러오지 못했습니다.');
        exception.code = 'latest_session_unavailable';
        exception.hint = fallbackHint;
        exception.supabaseError = sessionDiagnostics.error || null;
        exception.source = sessionDiagnostics.source || 'latest-session';
        throw exception;
      }

      return {
        roster: [],
        participantPool: [],
        heroOptions: [],
        heroMap: {},
        slotTemplate: null,
        matchSnapshot: null,
        sessionMeta: null,
        hostOwnerId: null,
        hostRoleLimit: null,
        realtimeMode: null,
        matchMode: '',
        slotTemplateVersion: null,
        slotTemplateUpdatedAt: null,
        matchInstanceId: null,
        roomId: null,
        sessionId: fallbackSessionRow?.id || null,
      };
    }

    rosterData = [];
  }

  let bestVersion =
    slotTemplateVersionOverride != null ? Number(slotTemplateVersionOverride) || 0 : -Infinity;
  rosterData.forEach(row => {
    const version = Number(row?.slot_template_version) || 0;
    if (version > bestVersion) {
      bestVersion = version;
    }
  });

  const rowsByRoom = new Map();
  rosterData.forEach(row => {
    const version = Number(row?.slot_template_version) || 0;
    if (version !== bestVersion) return;
    const roomId = toOptionalTrimmed(row?.room_id) || '__unknown__';
    if (!rowsByRoom.has(roomId)) {
      rowsByRoom.set(roomId, []);
    }
    rowsByRoom.get(roomId).push(row);
  });

  let targetRoomId = null;
  let targetRows = null;
  let targetUpdatedAt = -Infinity;

  rowsByRoom.forEach((rows, roomId) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    const latest = rows.reduce((acc, row) => {
      const timestamp =
        parseTimestamp(row?.slot_template_updated_at) ??
        parseTimestamp(row?.updated_at) ??
        parseTimestamp(row?.created_at);
      return Math.max(acc, timestamp != null ? timestamp : -Infinity);
    }, -Infinity);
    if (!targetRows || latest > targetUpdatedAt) {
      targetRows = rows;
      targetRoomId = roomId === '__unknown__' ? null : roomId;
      targetUpdatedAt = latest;
    }
  });

  if (!targetRows) {
    targetRows = rosterData.filter(row => Number(row?.slot_template_version) === bestVersion);
    targetRoomId = toOptionalTrimmed(targetRows[0]?.room_id) || null;
    targetUpdatedAt = targetRows.reduce((acc, row) => {
      const timestamp =
        parseTimestamp(row?.slot_template_updated_at) ??
        parseTimestamp(row?.updated_at) ??
        parseTimestamp(row?.created_at);
      return Math.max(acc, timestamp != null ? timestamp : -Infinity);
    }, -Infinity);
  }

  let normalizedRoster = targetRows.map((row, index) => normalizeRosterRow(row, index));
  let heroMap = buildHeroMap(targetRows);

  const slotTemplateVersion = bestVersion;
  const slotTemplateSource =
    slotTemplateSourceOverride || targetRows[0]?.slot_template_source || 'room-stage';
  const slotTemplateUpdatedAt =
    slotTemplateUpdatedAtOverride != null
      ? parseTimestamp(slotTemplateUpdatedAtOverride) || Date.now()
      : targetUpdatedAt !== -Infinity && targetUpdatedAt !== null
        ? targetUpdatedAt
        : Date.now();
  const matchInstanceId = toOptionalTrimmed(targetRows[0]?.match_instance_id);

  let roomRow = roomEnvelope || null;
  if (!roomRow && targetRoomId) {
    const { data: directRoom, error: directError } = await withTable(
      supabaseClient,
      'rank_rooms',
      table =>
        supabaseClient
          .from(table)
          .select(
            'id, owner_id, code, status, mode, realtime_mode, host_role_limit, blind_mode, score_window, updated_at, game_id'
          )
          .eq('id', targetRoomId)
          .maybeSingle()
    );
    if (!directError && directRoom) {
      roomRow = directRoom;
    }
  }

  if (!roomRow) {
    if (roomEnvelope) {
      roomRow = roomEnvelope;
      targetRoomId = toOptionalTrimmed(roomEnvelope?.id) || targetRoomId;
    } else {
      const { data: fallbackRooms, error: fallbackError } = await withTable(
        supabaseClient,
        'rank_rooms',
        table =>
          supabaseClient
            .from(table)
            .select(
              'id, owner_id, code, status, mode, realtime_mode, host_role_limit, blind_mode, score_window, updated_at, game_id'
            )
            .eq('game_id', trimmedGameId)
            .order('updated_at', { ascending: false })
            .limit(1)
      );
      if (!fallbackError && Array.isArray(fallbackRooms) && fallbackRooms.length) {
        roomRow = fallbackRooms[0];
        if (!targetRoomId) {
          targetRoomId = toOptionalTrimmed(roomRow?.id) || null;
        }
      }
    }
  }

  const formattedRoom = formatRoom(roomRow);

  let sessionRow = fallbackSessionRow || null;
  if (sessionEnvelope) {
    sessionRow = formatSessionRow(sessionEnvelope);
  }
  if (!sessionRow) {
    const sessionDiagnostics = {
      hint: null,
      error: null,
      source: null,
    };

    sessionRow = await fetchLatestSessionRow(supabaseClient, trimmedGameId, {
      onDiagnostics: info => {
        if (!info || typeof info !== 'object') return;
        const derivedHint = info.hint || deriveLatestSessionHint(info) || null;
        if (derivedHint && !sessionDiagnostics.hint) {
          sessionDiagnostics.hint = derivedHint;
        }
        if (info.error && !sessionDiagnostics.error) {
          sessionDiagnostics.error = info.error;
        }
        if (info.source && !sessionDiagnostics.source) {
          sessionDiagnostics.source = info.source;
        }
      },
    });

    if (!sessionRow && (sessionDiagnostics.hint || sessionDiagnostics.error)) {
      const fallbackHint =
        sessionDiagnostics.hint ||
        deriveLatestSessionHint({
          error: sessionDiagnostics.error,
          supabaseError: sessionDiagnostics.error,
        }) ||
        'fetch_latest_rank_session_v2 RPC를 호출하지 못했습니다. Supabase SQL Editor에서 함수를 재배포하고 권한을 확인하세요.';
      const exception = new Error('매치 세션 정보를 불러오지 못했습니다.');
      exception.code = 'latest_session_unavailable';
      exception.hint = fallbackHint;
      exception.supabaseError = sessionDiagnostics.error || null;
      exception.source = sessionDiagnostics.source || 'latest-session';
      throw exception;
    }
  }

  let sessionMeta = null;
  let sessionHistory = null;
  if (sessionMetaEnvelope) {
    sessionMeta = mapSessionMeta(sessionMetaEnvelope);
  }

  if (!sessionMeta && sessionRow?.id) {
    const { data: metaRow, error: metaError } = await withTable(
      supabaseClient,
      'rank_session_meta',
      table =>
        supabaseClient
          .from(table)
          .select(
            'session_id, selected_time_limit_seconds, time_vote, drop_in_bonus_seconds, turn_state, async_fill_snapshot, realtime_mode, extras, updated_at'
          )
          .eq('session_id', sessionRow.id)
          .maybeSingle()
    );
    if (!metaError && metaRow) {
      sessionMeta = mapSessionMeta(metaRow);
    }
  }

  if (sessionRow?.id && typeof supabaseClient?.from === 'function') {
    sessionHistory = await fetchSessionHistorySnapshot(supabaseClient, sessionRow.id, {
      limit: SESSION_HISTORY_LIMIT,
    });
  }

  const standinResult = applyAsyncFillStandins({
    roster: normalizedRoster,
    sessionMeta,
    heroMap,
  });

  if (standinResult?.applied) {
    normalizedRoster = standinResult.roster;
    heroMap = standinResult.heroMap;
    sessionMeta = standinResult.sessionMeta;
  } else {
    const asyncFillInfo = sessionMeta?.asyncFill || null;
    const asyncMode = toTrimmed(asyncFillInfo?.mode).toLowerCase();
    const queueEmpty =
      !Array.isArray(asyncFillInfo?.fillQueue) || asyncFillInfo.fillQueue.length === 0;

    if (asyncFillInfo && (asyncMode === 'off' || !asyncMode) && queueEmpty) {
      const seatRequests = buildAsyncFillSeatRequests({
        rosterList: normalizedRoster,
        asyncFill: asyncFillInfo,
        hostRole: asyncFillInfo?.hostRole || '',
      });

      if (seatRequests.length) {
        const excludeOwnerIds = normalizedRoster
          .map(entry => toOptionalTrimmed(entry?.ownerId))
          .filter(Boolean);

        const apiQueue = await fetchAsyncStandinQueueViaApi({
          gameId: trimmedGameId,
          roomId: targetRoomId,
          seatRequests,
          excludeOwnerIds,
        });

        if (Array.isArray(apiQueue) && apiQueue.length) {
          const patchedAsyncFill = cloneJson(asyncFillInfo) || {};
          patchedAsyncFill.fillQueue = apiQueue;

          const patchedSessionMeta = sessionMeta
            ? { ...sessionMeta, asyncFill: patchedAsyncFill }
            : { asyncFill: patchedAsyncFill };

          const reapplied = applyAsyncFillStandins({
            roster: normalizedRoster,
            sessionMeta: patchedSessionMeta,
            heroMap,
          });

          if (reapplied?.applied) {
            normalizedRoster = reapplied.roster;
            heroMap = reapplied.heroMap;
            sessionMeta = reapplied.sessionMeta;
          } else {
            sessionMeta = patchedSessionMeta;
          }
        }
      }
    }
  }

  const participantPool = buildParticipantPool(normalizedRoster);
  const heroOptions = Array.from(
    new Set(normalizedRoster.map(entry => entry.heroId).filter(Boolean))
  );
  const groups = buildRoleGroups(normalizedRoster);
  const assignments = buildAssignmentsFromGroups(groups);
  const roles = buildRolesFromGroups(groups);
  const slotLayout = buildSlotLayoutFromRoster(normalizedRoster);

  const matchRooms = formattedRoom ? [formattedRoom] : [];

  const matchSnapshot = {
    match: {
      instanceId: matchInstanceId,
      matchInstanceId,
      match_instance_id: matchInstanceId,
      assignments,
      maxWindow: formattedRoom?.scoreWindow ?? null,
      heroMap,
      matchCode: formattedRoom?.code || '',
      matchType: formattedRoom?.mode || 'standard',
      blindMode: formattedRoom?.blindMode ?? false,
      brawlVacancies: [],
      roleStatus: {
        slotLayout,
        roles: roles.map(role => ({
          role: role.role,
          slots: role.slots,
          members: role.members.map(member => ({ ...member })),
        })),
        version: slotTemplateVersion,
        updatedAt: slotTemplateUpdatedAt,
        source: slotTemplateSource,
      },
      sampleMeta: null,
      dropInTarget: null,
      turnTimer: sessionMeta?.turnTimer ?? null,
      rooms: matchRooms,
      roles: roles.map(role => ({
        role: role.role,
        slots: role.slots,
        members: role.members.map(member => ({ ...member })),
      })),
      slotLayout,
      source: 'match-realtime',
    },
    mode: formattedRoom?.mode || sessionRow?.mode || '',
    viewerId: '',
    heroId: '',
    role: '',
    createdAt: slotTemplateUpdatedAt,
  };

  const slotTemplate = {
    slots: slotLayout,
    roles: roles.map(role => ({
      role: role.role,
      slots: role.slots,
      members: role.members.map(member => ({ ...member })),
    })),
    version: slotTemplateVersion,
    updatedAt: slotTemplateUpdatedAt,
    source: slotTemplateSource,
  };

  return {
    roster: normalizedRoster,
    participantPool,
    heroOptions,
    heroMap,
    slotTemplate,
    matchSnapshot,
    sessionMeta,
    sessionHistory,
    hostOwnerId: formattedRoom?.ownerId || null,
    hostRoleLimit: formattedRoom?.hostRoleLimit ?? null,
    realtimeMode: formattedRoom?.realtimeMode || null,
    matchMode: matchSnapshot.mode || '',
    slotTemplateVersion,
    slotTemplateUpdatedAt,
    matchInstanceId,
    roomId: formattedRoom?.id || targetRoomId || null,
    sessionId: sessionRow?.id || null,
  };
}
