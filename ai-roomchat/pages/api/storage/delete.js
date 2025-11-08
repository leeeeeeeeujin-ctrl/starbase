// Next.js API route to delete an object from Cloudflare R2 by key or URL
// Body: { key?: string, url?: string }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { key: rawKey, url } = req.body || {};
    let key = '';

    if (rawKey && typeof rawKey === 'string') {
      key = String(rawKey).replace(/^\/+/, '');
    } else if (url && typeof url === 'string') {
      try {
        const u = new URL(url);
        key = String(u.pathname || '').replace(/^\/+/, '');
      } catch (_) {
        // Fallback: treat as path-like
        key = String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '');
      }
    }

    if (!key) return res.status(400).json({ error: 'key or url required' });

    // Minimal safety: restrict to known prefixes we control
  const allowedPrefixes = ['games/', 'chat/', 'studio/'];
    if (!allowedPrefixes.some(prefix => key.startsWith(prefix))) {
      return res.status(400).json({ error: 'unsupported key prefix' });
    }

    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const endpoint = process.env.R2_S3_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    const Bucket = process.env.R2_BUCKET;
    const Key = key;

    try {
      await client.send(new DeleteObjectCommand({ Bucket, Key }));
    } catch (error) {
      // If not found, treat as success for idempotency
      const code = error?.name || error?.Code || '';
      if (String(code).toLowerCase() !== 'nosuchkey') {
        throw error;
      }
    }

    res.status(200).json({ ok: true, key });
  } catch (error) {
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error?.message || 'delete failed' });
  }
}
