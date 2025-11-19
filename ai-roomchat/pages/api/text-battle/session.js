import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const { id, sessionId } = req.query || {};
  const sid = id || sessionId;

  if (!sid) {
    return res.status(400).json({ ok: false, error: 'missing_session_id' });
  }

  if (!supabaseAdmin || typeof supabaseAdmin.from !== 'function') {
    return res
      .status(500)
      .json({ ok: false, error: 'supabase_not_configured' });
  }

  try {
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('text_battle_sessions')
      .select('*')
      .eq('id', sid)
      .maybeSingle?.();

    if (sessionError) {
      return res.status(500).json({
        ok: false,
        error: 'session_query_failed',
        detail: sessionError.message || null,
      });
    }

    if (!session) {
      return res
        .status(404)
        .json({ ok: false, error: 'session_not_found' });
    }

    const { data: turns, error: turnsError } = await supabaseAdmin
      .from('text_battle_turns')
      .select('*')
      .eq('session_id', sid)
      .order('turn_index', { ascending: true });

    if (turnsError) {
      return res.status(500).json({
        ok: false,
        error: 'turns_query_failed',
        detail: turnsError.message || null,
      });
    }

    return res.status(200).json({
      ok: true,
      session,
      turns: Array.isArray(turns) ? turns : [],
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      detail: e?.message || String(e),
    });
  }
}

