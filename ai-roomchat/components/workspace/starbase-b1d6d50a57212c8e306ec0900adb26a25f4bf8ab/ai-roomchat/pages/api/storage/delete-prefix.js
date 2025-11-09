// Delete all objects in R2 under a given prefix (limited batch)
// Body: { prefix: string, max?: number }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { prefix: rawPrefix, max } = req.body || {};
    const prefix = String(rawPrefix || '').replace(/^\/+/, '');
    if (!prefix) return res.status(400).json({ error: 'prefix required' });

    // Safety: only allow known managed prefixes
    const allowed = ['studio/resources/', 'games/', 'chat/'];
    if (!allowed.some(p => prefix.startsWith(p))) {
      return res.status(400).json({ error: 'unsupported prefix' });
    }

    const limit = Math.max(1, Math.min(Number(max) || 1000, 1000));

    const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
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

    // List
    const listed = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, MaxKeys: limit }));
    const contents = listed?.Contents || [];
    if (!contents.length) {
      return res.status(200).json({ ok: true, deleted: 0, prefix });
    }

    // Delete batch
    const Objects = contents.map(obj => ({ Key: obj.Key })).filter(it => it.Key);
    if (Objects.length) {
      await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects } }));
    }

    return res.status(200).json({ ok: true, deleted: Objects.length, prefix });
  } catch (error) {
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error?.message || 'delete-prefix failed' });
  }
}
