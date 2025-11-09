export default async function handler(req, res) {
  const { gameId } = req.query || {};
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    // Default: return empty manifest. If Supabase table 'assets' exists, try to load rows by game_id.
    let assets = [];
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        let q = supabase.from('assets').select('hash, key, size');
        if (gameId && gameId !== 'common') q = q.eq('game_id', String(gameId));
        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          assets = data.map(r => ({ hash: r.hash, path: r.key, size: r.size || 0 }));
        }
      }
    } catch {}
    const baseUrl = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    return res.json({ baseUrl, assets });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'manifest failed' });
  }
}

