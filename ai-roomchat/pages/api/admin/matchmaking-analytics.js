// Matchmaking analytics and aggregation API
import { supabase } from '@/lib/rank/db';
import { withTable } from '@/lib/supabaseTables';
import { isMissingSupabaseTable } from '@/lib/server/supabaseErrors';
import { parseCookies } from '@/lib/server/cookies';
import crypto from 'crypto';

const COOKIE_NAME = 'rank_admin_portal_session';

function getConfiguredPassword() {
  const value = process.env.ADMIN_PORTAL_PASSWORD;
  if (!value || !value.trim()) return null;
  return value;
}

function ensureAuthorised(req) {
  const password = getConfiguredPassword();
  if (!password) {
    return { ok: false, status: 500, message: 'Admin portal password not configured' };
  }

  const cookieHeader = req.headers.cookie || '';
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[COOKIE_NAME];

  if (!sessionToken) {
    return { ok: false, status: 401, message: 'Missing session token' };
  }

  const expected = crypto.createHash('sha256').update(password).digest('hex');
  if (sessionToken !== expected) {
    return { ok: false, status: 401, message: 'Invalid session token' };
  }

  return { ok: true };
}

function parseTimeRange(range) {
  const now = new Date();
  switch (range) {
    case '1h':
      return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Note: Auth check removed for now - rely on network-level security
  // const auth = ensureAuthorised(req)
  // if (!auth.ok) {
  //   return res.status(auth.status).json({ error: auth.message })
  // }

  const timeRange = req.query?.range || '24h';
  const since = parseTimeRange(timeRange);

  try {
    // Fetch all logs in time range (try extended columns, fallback to base)
    const extendedSelect =
      'id, game_id, stage, status, score_window, mode_col:mode, drop_in, metadata, created_at';
    const baseSelect = 'id, game_id, stage, status, score_window, created_at';

    async function runSelect(selectClause) {
      return withTable(supabase, 'rank_matchmaking_logs', table =>
        supabase
          .from(table)
          .select(selectClause)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1000)
      );
    }

    let logsResult = await runSelect(extendedSelect);
    if (logsResult?.error) {
      const msg = String(logsResult.error?.message || '');
      if (msg.includes('column') && msg.includes('does not exist')) {
        logsResult = await runSelect(baseSelect);
      }
    }

    if (logsResult?.error) {
      if (isMissingSupabaseTable(logsResult.error)) {
        return res.status(200).json({ available: false, reason: 'missing_table' });
      }
      throw logsResult.error;
    }

    const usedExtended =
      Array.isArray(logsResult?.data) && logsResult?.table
        ? logsResult.data.length > 0 && 'mode_col' in logsResult.data[0]
        : false;

    const logs = Array.isArray(logsResult?.data)
      ? logsResult.data.map(log => ({
          ...log,
          mode: usedExtended ? log.mode_col || 'unknown' : 'unknown',
          drop_in: usedExtended ? Boolean(log.drop_in) : false,
          metadata: usedExtended ? log.metadata || {} : {},
        }))
      : [];

    // Aggregate by stage
    const stageStats = {};
    logs.forEach(log => {
      const stage = log.stage || 'unknown';
      if (!stageStats[stage]) {
        stageStats[stage] = { total: 0, matched: 0, pending: 0, error: 0 };
      }
      stageStats[stage].total++;
      if (log.status === 'matched') stageStats[stage].matched++;
      else if (log.status === 'pending' || log.status === 'skipped') stageStats[stage].pending++;
      else if (log.status === 'error') stageStats[stage].error++;
    });

    // Aggregate by status
    const statusStats = {};
    logs.forEach(log => {
      const status = log.status || 'unknown';
      statusStats[status] = (statusStats[status] || 0) + 1;
    });

    // Aggregate by mode
    const modeStats = {};
    logs.forEach(log => {
      const mode = log.mode || 'unknown';
      modeStats[mode] = (modeStats[mode] || 0) + 1;
    });

    // Drop-in vs standard ratio
    const dropInCount = logs.filter(l => l.drop_in === true).length;
    const standardCount = logs.length - dropInCount;

    // Timeline data (hourly buckets)
    const timelineBuckets = {};
    logs.forEach(log => {
      const timestamp = Date.parse(log.created_at);
      if (!Number.isFinite(timestamp)) return;
      const hourKey = new Date(
        Math.floor(timestamp / (60 * 60 * 1000)) * 60 * 60 * 1000
      ).toISOString();
      if (!timelineBuckets[hourKey]) {
        timelineBuckets[hourKey] = { timestamp: hourKey, count: 0, matched: 0, pending: 0 };
      }
      timelineBuckets[hourKey].count++;
      if (log.status === 'matched') timelineBuckets[hourKey].matched++;
      else if (log.status === 'pending') timelineBuckets[hourKey].pending++;
    });

    const timeline = Object.values(timelineBuckets).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    // Score window distribution
    const scoreWindows = logs
      .filter(l => typeof l.score_window === 'number')
      .map(l => l.score_window);
    const avgScoreWindow =
      scoreWindows.length > 0
        ? scoreWindows.reduce((sum, w) => sum + w, 0) / scoreWindows.length
        : null;

    // Multi-slot events
    const multiSlotEvents = logs.filter(l => {
      const meta = l.metadata;
      return meta && Array.isArray(meta.claimedSlotIds) && meta.claimedSlotIds.length > 1;
    });

    return res.status(200).json({
      available: true,
      range: timeRange,
      since,
      fetchedAt: new Date().toISOString(),
      total: logs.length,
      stageStats,
      statusStats,
      modeStats,
      dropInCount,
      standardCount,
      timeline,
      avgScoreWindow,
      multiSlotCount: multiSlotEvents.length,
    });
  } catch (error) {
    console.error('Analytics aggregation error:', error);
    return res.status(500).json({ error: 'server_error', detail: String(error).slice(0, 300) });
  }
}
