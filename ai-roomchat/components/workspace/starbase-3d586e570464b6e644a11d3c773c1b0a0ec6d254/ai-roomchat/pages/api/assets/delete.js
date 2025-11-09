export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { key, hash, messageId } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key_required' });
  if (!messageId) return res.status(400).json({ error: 'message_id_required' });

  // Require Supabase auth token from Authorization header
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    // Validate user and ownership of message/attachment
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return res.status(500).json({ error: 'server_misconfigured' });
    }

    const anonClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    const viewer = userData?.user || null;
    if (userError || !viewer?.id) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: msg, error: msgErr } = await adminClient
      .from('messages')
      .select('id, owner_id, metadata')
      .eq('id', messageId)
      .maybeSingle();

    if (msgErr || !msg) {
      return res.status(404).json({ error: 'message_not_found' });
    }

    if (String(msg.owner_id) !== String(viewer.id)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const attachments = Array.isArray(msg?.metadata?.attachments)
      ? msg.metadata.attachments
      : [];
    const normalizedKey = String(key).replace(/^\//, '');
    const allowed = attachments.some(att => {
      if (!att) return false;
      const path = String(att.path || '').replace(/^\//, '');
      const h = att.hash || null;
      if (h && hash && String(h) === String(hash)) return true;
      return path && path === normalizedKey;
    });

    if (!allowed) {
      return res.status(403).json({ error: 'attachment_not_owned' });
    }

    // Delete object from R2
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const endpoint =
      process.env.R2_S3_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    const Bucket = process.env.R2_BUCKET;
    const Key = normalizedKey;
    await client.send(new DeleteObjectCommand({ Bucket, Key }));

    // Best-effort bookkeeping in an optional assets table
    try {
      const h = hash || null;
      if (h) {
        const { data, error } = await adminClient
          .from('assets')
          .select('hash, size, ref_count')
          .eq('hash', h)
          .maybeSingle();
        if (!error && data) {
          if ((data.ref_count || 1) > 1) {
            await adminClient.from('assets').update({ ref_count: (data.ref_count || 1) - 1 }).eq('hash', h);
          } else {
            await adminClient.from('assets').delete().eq('hash', h);
            try {
              const mod = await import('../../../lib/server/quota.js');
              await mod.decStorageBytes(Number(data.size) || 0);
            } catch {}
          }
        }
      }
    } catch {}

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'delete_failed' });
  }
}

