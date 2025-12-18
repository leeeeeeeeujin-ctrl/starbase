import { supabaseAdmin } from '@/lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // Optional simple auth gate (aligned with other rank APIs):
  const apiKey = process.env.RANK_API_KEY || null;
  if (apiKey) {
    const provided = req.headers['x-api-key'];
    if (!provided || provided !== apiKey) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid_payload' });
    }
  }
  if (!payload || typeof payload !== 'object') {
    payload = {};
  }

  const rankSessionId =
    payload.rankSessionId ||
    payload.rank_session_id ||
    payload.sessionId ||
    payload.session_id ||
    null;
  const textSessionId =
    payload.textSessionId ||
    payload.text_session_id ||
    payload.textBattleSessionId ||
    payload.text_battle_session_id ||
    null;
  const summary =
    payload.summary && typeof payload.summary === 'object'
      ? payload.summary
      : null;

  if (!textSessionId) {
    return res.status(400).json({
      ok: false,
      error: 'missing_text_session_id',
      message: 'textSessionId (또는 text_session_id) 가 필요합니다.',
    });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'finalize_text_battle_rank',
      {
        p_rank_session_id: rankSessionId || null,
        p_text_session_id: textSessionId,
        p_summary: summary || {},
      }
    );

    if (error) {
      return res.status(502).json({
        ok: false,
        error: 'rpc_failed',
        supabaseError: {
          code: error.code || null,
          message: error.message || null,
          details: error.details || null,
          hint: error.hint || null,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      result: data || null,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: 'rpc_exception',
      message: String(e?.message || e),
    });
  }
}

