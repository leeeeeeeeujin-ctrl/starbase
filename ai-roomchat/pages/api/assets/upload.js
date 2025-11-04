export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } },
};

function extFromNameOrType(name = '', type = '') {
  const n = String(name||'');
  if (n.includes('.')) return n.split('.').pop();
  const t = String(type||'').split('/')[1] || '';
  return t || 'bin';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { name, contentType, dataBase64, gameId, sha256 } = req.body || {};
    if (!dataBase64 || !name) return res.status(400).json({ error: 'name and dataBase64 required' });
    // Enforce size limit
    const maxBytes = parseInt(process.env.UPLOAD_MAX_BYTES || '26214400', 10); // 25MB default
    const b64 = String(dataBase64||'');
    const approxBytes = Math.floor((b64.length * 3) / 4); // rough
    if (maxBytes && approxBytes > maxBytes) return res.status(413).json({ error: 'payload too large' });
    // Enforce allowed mime
    const allow = String(process.env.UPLOAD_ALLOWED_MIME || '').split(',').map(s=>s.trim()).filter(Boolean);
    if (allow.length && contentType && !allow.includes(contentType)) return res.status(415).json({ error: 'mime not allowed' });
    // Simple user-based rate limit via Supabase (best-effort)
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ')? auth.slice(7): null;
    if (token) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (supabaseUrl && anon) {
          const anonClient = createClient(supabaseUrl, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
          const { data: userData } = await anonClient.auth.getUser();
          const uid = userData?.user?.id || null;
          const limit = parseInt(process.env.UPLOAD_RATE_PER_MIN || '5', 10);
          if (uid && limit > 0) {
            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
            if (serviceKey) {
              const svc = createClient(supabaseUrl, serviceKey);
              const since = new Date(Date.now() - 60 * 1000).toISOString();
              const { data: recent } = await svc.from('assets').select('id, created_at, created_by').gte('created_at', since).eq('created_by', uid);
              if (Array.isArray(recent) && recent.length >= limit) return res.status(429).json({ error: 'rate limit exceeded' });
            }
          }
        }
      } catch {}
    }
    const Bucket = process.env.R2_BUCKET;
    const endpoint = process.env.R2_S3_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    if (!Bucket || !endpoint) return res.status(500).json({ error: 'R2 not configured' });

    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    const ext = extFromNameOrType(name, contentType);
    const base = (sha256 && /^[a-f0-9]{32,}$/.test(sha256)) ? sha256 : Math.random().toString(36).slice(2);
    const Key = `games/${gameId||'common'}/${base}.${ext}`.replace(/\/+/, '/');

    // decode base64 (data:...;base64,xxxx or pure base64)
    const raw = String(dataBase64||'');
    const b64data = raw.includes(',') ? raw.split(',').pop() : raw;
    const bin = Buffer.from(b64data, 'base64');

    const meta = sha256 ? { sha256 } : undefined;
    await client.send(new PutObjectCommand({ Bucket, Key, Body: bin, ContentType: contentType||'application/octet-stream', Metadata: meta }));

    // record in Supabase (best-effort)
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        // Try to resolve created_by from token
        let created_by = null;
        if (token) {
          try {
            const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            if (anon) {
              const anonClient = createClient(supabaseUrl, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
              const { data: userData } = await anonClient.auth.getUser();
              created_by = userData?.user?.id || null;
            }
          } catch {}
        }
        await supabase.from('assets').upsert({ hash: sha256||null, key: Key, size: bin.length, mime: contentType||null, game_id: gameId||null, visibility: 'public', ref_count: 1, created_by }, { onConflict: 'hash' });
      }
    } catch {}

    const baseUrl = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const url = baseUrl ? `${baseUrl}/${Key}` : null;
    return res.status(200).json({ ok: true, url, key: Key, hash: sha256||null, size: bin.length, mime: contentType||null });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'upload failed' });
  }
}
