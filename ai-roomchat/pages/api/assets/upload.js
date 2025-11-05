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
    const b64 = raw.includes(',') ? raw.split(',').pop() : raw;
    const bin = Buffer.from(b64, 'base64');

    const meta = sha256 ? { sha256 } : undefined;
    await client.send(new PutObjectCommand({ Bucket, Key, Body: bin, ContentType: contentType||'application/octet-stream', Metadata: meta }));

    // record in Supabase (best-effort)
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from('assets').upsert({ hash: sha256||null, key: Key, size: bin.length, mime: contentType||null, game_id: gameId||null, visibility: 'public', ref_count: 1 }, { onConflict: 'hash' });
      }
    } catch {}

    const baseUrl = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const url = baseUrl ? `${baseUrl}/${Key}` : null;
    return res.status(200).json({ ok: true, url, key: Key, hash: sha256||null, size: bin.length, mime: contentType||null });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'upload failed' });
  }
}

