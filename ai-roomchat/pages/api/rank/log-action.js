import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withTableQuery } from '@/lib/supabaseTables';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for log-action API');
}

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
});

// Minimal audit endpoint: accepts a compact summary of a locally-run action
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  const user = userData?.user || null;
  if (userError || !user) return res.status(401).json({ error: 'unauthorized' });

  let payload = req.body || {};
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch (err) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
  }

  const { action, summary = null, result = null, session_id: sessionId = null, game_id: gameId = null, request_id: requestId = null } = payload || {};

  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'missing_action' });
  }

  // best-effort insert into rank_action_logs (POC)
  try {
    await withTableQuery(supabaseAdmin, 'rank_action_logs', from =>
      supabaseAdmin.from(from).insert({
        request_id: requestId || null,
        session_id: sessionId || null,
        user_id: user?.id || null,
        action_name: action,
        payload: {}, // client should not send full payload for privacy; keep empty or minimal
        result: result || null,
        ok: true,
        summary: summary || null,
      })
    );
  } catch (err) {
    console.warn('[log-action] audit insert failed', err?.message || err);
    // don't fail client for audit write errors
  }

  return res.status(200).json({ ok: true });
}
