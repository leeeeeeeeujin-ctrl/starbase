import { supabaseAdmin } from '@/lib/supabaseAdmin';

function sanitizeSessionId(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function sanitizeSince(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso || null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const millis = Math.floor(numeric);
    if (millis <= 0) return null;
    const iso = new Date(millis).toISOString();
    return iso || null;
  }
  const str = String(value).trim();
  if (!str) return null;
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function sanitizeLimit(value) {
  if (value === undefined || value === null || value === '') {
    return 50;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.floor(numeric);
  if (rounded <= 0) return null;
  return Math.min(rounded, 200);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', ['GET']);
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const sessionId = sanitizeSessionId(req.query.sessionId || req.query.session_id);
  if (!sessionId) {
    return res.status(400).json({ error: 'missing_session_id' });
  }

  const since = sanitizeSince(req.query.since || req.query.after || req.query.emittedAfter);
  const limit = sanitizeLimit(req.query.limit);
  if (limit === null) {
    return res.status(400).json({ error: 'invalid_limit' });
  }

  const rpcPayload = {
    p_session_id: sessionId,
    p_since: since,
    p_limit: limit,
  };

  const { data, error } = await supabaseAdmin.rpc('fetch_rank_turn_state_events', rpcPayload);

  if (error) {
    console.error('[turn-events] fetch failed:', error);
    return res.status(500).json({ error: 'fetch_failed' });
  }

  const events = Array.isArray(data) ? data : [];
  return res.status(200).json({ ok: true, events });
}
