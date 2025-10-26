import { parseCookies } from '@/lib/server/cookies';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { autoAdvanceRealSimulation } from '@/lib/realTableSimulator';
import OpenAI from 'openai';

const COOKIE_NAME = 'rank_admin_portal_session';

function ensureAuthorised(req) {
  const password = process.env.ADMIN_PORTAL_PASSWORD;
  if (!password || !password.trim()) {
    return { ok: false, status: 500, message: 'Admin portal password is not configured' };
  }
  const cookieHeader = req.headers.cookie || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies[COOKIE_NAME];
  const expected = require('crypto').createHash('sha256').update(password).digest('hex');
  if (!token || token !== expected) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const auth = ensureAuthorised(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.message });
  try {
    const { sessionId } = req.query;
    const { turns = 1, apiKey } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId_required' });
    let aiClient = null;
    if (apiKey) aiClient = new OpenAI({ apiKey });
    const results = await autoAdvanceRealSimulation(supabaseAdmin, sessionId, turns, aiClient);
    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'advance_failed' });
  }
}
