import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { extractBearerToken } from '@/services/rank/matchStageRequest';
import { fetchUserByToken } from '@/services/rank/matchSupabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  const user = await fetchUserByToken(token);
  if (!user.ok) return res.status(401).json({ error: 'unauthorized' });

  const body = req.body || {};
  const matchInstanceId = body.match_instance_id || body.matchInstanceId || null;
  const suggestedWindow = Number(body.suggested_window ?? body.suggestedWindow ?? body.requested_window ?? body.requestedWindow ?? 0);

  if (!matchInstanceId) return res.status(400).json({ error: 'missing_match_instance_id' });
  if (!Number.isFinite(suggestedWindow) || suggestedWindow <= 0) {
    return res.status(400).json({ error: 'invalid_suggested_window' });
  }

  try {
    // verify session exists
    const { data: sessionRows, error: sessionError } = await supabaseAdmin
      .from('rank_sessions')
      .select('id, owner_id')
      .eq('id', matchInstanceId)
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      return res.status(500).json({ error: 'session_lookup_failed', details: sessionError.message });
    }

    if (!sessionRows || !sessionRows.id) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    // optional: require session owner to be requester — allow for now if owner matches
    if (sessionRows.owner_id && String(sessionRows.owner_id).trim() !== String(user.user.id).trim()) {
      return res.status(403).json({ error: 'forbidden' });
    }

    // fetch existing meta
    const { data: metaRow, error: metaError } = await supabaseAdmin
      .from('rank_session_meta')
      .select('extras')
      .eq('session_id', matchInstanceId)
      .limit(1)
      .maybeSingle();

    if (metaError) {
      return res.status(500).json({ error: 'meta_lookup_failed', details: metaError.message });
    }

    const existingExtras = metaRow && metaRow.extras ? metaRow.extras : {};
    const now = new Date().toISOString();
    const patched = {
      ...(existingExtras || {}),
      userRequestedWindow: {
        requestedWindow: Math.trunc(Number(suggestedWindow)),
        requestedBy: String(user.user.id).trim(),
        requestedAt: now,
      },
    };

    // upsert meta row
    const payload = {
      session_id: matchInstanceId,
      extras: patched,
      updated_at: now,
    };

    const { data: upserted, error: upsertError } = await supabaseAdmin
      .from('rank_session_meta')
      .upsert(payload, { onConflict: 'session_id' });

    if (upsertError) {
      return res.status(500).json({ error: 'meta_upsert_failed', details: upsertError.message });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[user-request-window] error', error);
    return res.status(500).json({ error: 'internal_error' });
  }
}
