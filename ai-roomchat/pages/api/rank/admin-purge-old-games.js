// Admin endpoint to purge outdated test data from rank_games.
// Guarded by x-admin-password header matching ADMIN_PORTAL_PASSWORD.

import { supabase as supabaseAdmin } from '@/lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const pass = req.headers['x-admin-password'] || req.headers['x_admin_password'] || '';
  const expected = process.env.ADMIN_PORTAL_PASSWORD || '';
  if (!expected || pass !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const deleteAll = req.body?.deleteAll === true || req.body?.deleteAll === 'true';
  const olderThanDays = Math.max(1, Math.min(parseInt(req.body?.olderThanDays ?? '180', 10) || 180, 2000));
  const limit = Math.max(1, Math.min(parseInt(req.body?.limit ?? '500', 10) || 500, 5000));
  const like = String(req.body?.like || '').trim();

  try {
    if (!supabaseAdmin || !supabaseAdmin.from) {
      return res.status(500).json({ error: 'admin_client_unavailable' });
    }

    if (deleteAll) {
      const { error: delAllErr, count } = await supabaseAdmin
        .from('rank_games')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (delAllErr) return res.status(500).json({ error: delAllErr.message || 'delete_failed' });
      return res.status(200).json({ ok: true, deleted: count ?? null, all: true });
    } else {
      // Build candidate filter
      const { data: candidates, error } = await supabaseAdmin
        .from('rank_games')
        .select('id, name, created_at, play_count, likes_count')
        .or([
          "name.ilike.%test%",
          "name.ilike.%테스트%",
          "rules_prefix.ilike.%test%",
          like ? `name.ilike.%${like}%` : undefined,
        ].filter(Boolean).join(','))
        .lte('created_at', new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString())
        .eq('play_count', 0)
        .eq('likes_count', 0)
        .limit(limit);

      if (error) return res.status(500).json({ error: error.message || 'query_failed' });
      const ids = (candidates || []).map(r => r.id).filter(Boolean);
      if (!ids.length) return res.status(200).json({ ok: true, deleted: 0 });

      const { error: delErr } = await supabaseAdmin.from('rank_games').delete().in('id', ids);
      if (delErr) return res.status(500).json({ error: delErr.message || 'delete_failed' });
      return res.status(200).json({ ok: true, deleted: ids.length });
    }
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'purge_failed' });
  }
}
