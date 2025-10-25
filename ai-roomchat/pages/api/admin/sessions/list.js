import { parseCookies } from '@/lib/server/cookies';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const COOKIE_NAME = 'rank_admin_portal_session';
const DEFAULT_LIMIT = 50;

function getConfiguredPassword() {
  const value = process.env.ADMIN_PORTAL_PASSWORD;
  if (!value || !value.trim()) return null;
  return value;
}

function getSessionToken(secret) {
  const { createHash } = require('crypto');
  return createHash('sha256').update(secret).digest('hex');
}

function isAuthorised(req) {
  const password = getConfiguredPassword();
  if (!password)
    return { ok: false, status: 500, message: 'Admin portal password is not configured' };
  const cookieHeader = req.headers.cookie || '';
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[COOKIE_NAME];
  if (!sessionToken) return { ok: false, status: 401, message: 'Missing session token' };
  const expected = getSessionToken(password);
  if (sessionToken !== expected)
    return { ok: false, status: 401, message: 'Invalid session token' };
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const auth = isAuthorised(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.message });

  const limitParam = Number.parseInt(req.query.limit, 10);
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 200 ? limitParam : DEFAULT_LIMIT;
  const gameId = (req.query.gameId || '').trim();

  try {
    let query = supabaseAdmin
      .from('rank_sessions')
      .select('id, game_id, owner_id, status, turn, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (gameId) {
      query = query.eq('game_id', gameId);
    }

    const { data: sessions, error } = await query;
    if (error) throw error;

    // Load game names for display
    const gameIds = Array.from(new Set((sessions || []).map(s => s.game_id).filter(Boolean)));
    let gamesMap = {};
    if (gameIds.length) {
      const { data: games, error: gameErr } = await supabaseAdmin
        .from('rank_games')
        .select('id, name')
        .in('id', gameIds);
      if (gameErr) throw gameErr;
      gamesMap = (games || []).reduce((acc, g) => {
        acc[g.id] = g.name;
        return acc;
      }, {});
    }

    const items = (sessions || []).map(s => ({
      ...s,
      game_name: gamesMap[s.game_id] || s.game_id,
    }));

    return res.status(200).json({ items });
  } catch (e) {
    console.error('[admin/sessions/list] failure', e);
    return res.status(500).json({ error: 'Failed to load sessions', message: e.message });
  }
}

export const config = { api: { bodyParser: false } };
