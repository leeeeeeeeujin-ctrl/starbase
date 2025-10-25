import { withTable } from '@/lib/supabaseTables';
import { isMissingSupabaseTable } from '@/lib/server/supabaseErrors';

function nowIso() {
  return new Date().toISOString();
}

function coerceNumber(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return null;
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('matchmaking log metadata serialization failed', error);
    return {};
  }
}

export async function recordMatchmakingLog(supabaseClient, payload = {}) {
  if (!supabaseClient) return null;
  if (!payload || typeof payload !== 'object') return null;

  const base = {
    created_at: payload.created_at || nowIso(),
    game_id: payload.game_id || payload.gameId || null,
    room_id: payload.room_id || payload.roomId || null,
    session_id: payload.session_id || payload.sessionId || null,
    stage: payload.stage || null,
    status: payload.status || null,
    reason: payload.reason || null,
    match_code: payload.match_code || payload.matchCode || null,
    score_window: coerceNumber(payload.score_window ?? payload.scoreWindow),
  };

  // Prefer richer columns when available
  const rich = {
    ...base,
    mode: payload.mode || null,
    drop_in: typeof payload.drop_in === 'boolean' ? payload.drop_in : Boolean(payload.dropIn),
    metadata: sanitizeMetadata(payload.metadata),
  };

  try {
    // First try with rich columns
    const first = await withTable(supabaseClient, 'rank_matchmaking_logs', table =>
      supabaseClient.from(table).insert(rich)
    );

    if (!first?.error) {
      return Array.isArray(first?.data) && first.data.length > 0 ? first.data[0] : null;
    }

    // If missing column(s), fall back to base shape
    const msg = `${first.error?.message || ''} ${first.error?.details || ''}`.toLowerCase();
    const missingColumn =
      first.error?.code === '42703' || msg.includes('column') || msg.includes('schema cache');

    if (missingColumn) {
      const fallback = await withTable(supabaseClient, 'rank_matchmaking_logs', table =>
        supabaseClient.from(table).insert(base)
      );
      if (!fallback?.error) {
        return Array.isArray(fallback?.data) && fallback.data.length > 0 ? fallback.data[0] : null;
      }
      if (isMissingSupabaseTable(fallback.error)) return null;
      throw fallback.error;
    }

    if (isMissingSupabaseTable(first.error)) return null;
    throw first.error;
  } catch (error) {
    if (isMissingSupabaseTable(error)) {
      return null;
    }
    console.warn('matchmaking log insert failed', error);
    return null;
  }
}

export function buildAssignmentSummary(assignments = []) {
  const owners = new Set();
  const queueEntries = new Set();
  const heroes = new Set();
  const roles = new Set();

  assignments.forEach(assignment => {
    if (!assignment || !Array.isArray(assignment.members)) return;
    assignment.members.forEach(member => {
      if (!member) return;
      const ownerId = member.owner_id || member.ownerId;
      const queueId = member.id || member.queue_id || member.queueId;
      const heroId = member.hero_id || member.heroId;
      if (ownerId) owners.add(ownerId);
      if (queueId) queueEntries.add(queueId);
      if (heroId) heroes.add(heroId);
      if (assignment.role) {
        roles.add(assignment.role);
      }
    });
  });

  return {
    owners: Array.from(owners),
    queueEntries: Array.from(queueEntries),
    heroes: Array.from(heroes),
    roles: Array.from(roles),
  };
}
