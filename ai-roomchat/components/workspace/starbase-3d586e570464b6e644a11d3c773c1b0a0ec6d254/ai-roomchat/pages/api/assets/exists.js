import { enforceAndCountClassB } from '../../../lib/server/quota.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { hash } = req.body || {};
    if (!hash || typeof hash !== 'string') return res.status(400).json({ error: 'hash required' });
    try { await enforceAndCountClassB(); } catch (e) { return res.status(e.statusCode||429).json({ error: e.message, code: e.code }); }
    // If you have a Supabase table 'assets', check it here. Fallback: not found.
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ')? auth.slice(7) : null;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey, token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {});
        const { data, error } = await supabase.from('assets').select('key, mime').eq('hash', hash).maybeSingle();
        if (!error && data) {
          const base = process.env.R2_PUBLIC_BASE_URL || '';
          const url = base && data.key ? `${base.replace(/\/$/,'')}/${data.key.replace(/^\//,'')}` : null;
          return res.json({ exists: true, key: data.key, url, mime: data.mime });
        }
      }
    } catch {}
    return res.json({ exists: false });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'exists failed' });
  }
}
