import { reconcileStorageOnCommit, incClassA, enforceBeforeClassA } from '../../../lib/server/quota.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { key, hash, size, mime, gameId, visibility = 'public' } = req.body || {};
  if (!key || !hash) return res.status(400).json({ error: 'key and hash required' });
  try {
    // Optional: persist into Supabase table 'assets'
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ')? auth.slice(7) : null;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey, token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {});
        // If this content hash is new (no existing row), enforce storage cap with the declared size
        try {
          const { data: existing } = await supabase.from('assets').select('hash').eq('hash', hash).maybeSingle();
          if (!existing) {
            await enforceBeforeClassA({ size: Number(size) || 0 });
          }
        } catch {}
        // upsert by hash
        await supabase.from('assets').upsert({ hash, key, size: size||null, mime: mime||null, game_id: gameId||null, visibility, ref_count: 1 }, { onConflict: 'hash' });
      }
    } catch {}
    // Update storage counters if this is a new hash; count class A for bookkeeping
    try { await reconcileStorageOnCommit({ hash, size: Number(size)||0 }); } catch {}
    try { await incClassA(1); } catch {}
    const base = process.env.R2_PUBLIC_BASE_URL || '';
    const url = base ? `${base.replace(/\/$/,'')}/${key.replace(/^\//,'')}` : null;
    return res.json({ ok: true, key, url });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'commit failed' });
  }
}
