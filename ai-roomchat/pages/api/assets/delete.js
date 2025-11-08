export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  const { key, hash } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key required' });
  try {
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const endpoint = process.env.R2_S3_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const client = new S3Client({
      region: 'auto', endpoint,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    });
    const Bucket = process.env.R2_BUCKET;
    const Key = String(key).replace(/^\//,'');
    await client.send(new DeleteObjectCommand({ Bucket, Key }));

    // Update DB bookkeeping if available
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const h = hash || null;
        if (h) {
          const { data, error } = await supabase.from('assets').select('hash, size, ref_count').eq('hash', h).maybeSingle();
          if (!error && data) {
            if ((data.ref_count || 1) > 1) {
              await supabase.from('assets').update({ ref_count: (data.ref_count||1) - 1 }).eq('hash', h);
            } else {
              await supabase.from('assets').delete().eq('hash', h);
              // Best-effort: decrement storage bytes
              try {
                const mod = await import('../../../lib/server/quota.js');
                await mod.decStorageBytes(Number(data.size)||0);
              } catch {}
            }
          }
        }
      }
    } catch {}

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'delete failed' });
  }
}

