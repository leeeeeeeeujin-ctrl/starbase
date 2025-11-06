// Delete any objects in R2 under games/*/{setId}/**
// Body: { setId: string | number, totalLimit?: number, pageSize?: number }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let { setId, totalLimit, pageSize } = req.body || {};
    const raw = String(setId ?? '').trim();
    if (!raw) return res.status(400).json({ error: 'setId required' });
    // Safety: only allow safe id-like values (uuid, numeric, or slug with -/_)
    const safeSetId = raw.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeSetId) return res.status(400).json({ error: 'invalid setId' });

    const limitAll = Math.max(1, Math.min(Number(totalLimit) || 5000, 20000));
    const limitPage = Math.max(100, Math.min(Number(pageSize) || 1000, 1000));

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

    const matchRe = new RegExp(`^games/[^/]+/${safeSetId}/`);
    let deleted = 0;
    let ContinuationToken = undefined;
    let rounds = 0;

    while (deleted < limitAll) {
      rounds++;
      const listed = await client.send(new ListObjectsV2Command({
        Bucket,
        Prefix: 'games/',
        MaxKeys: limitPage,
        ContinuationToken,
      }));
      const contents = listed?.Contents || [];
      if (!contents.length) break;

      // Filter keys that match /games/{any}/{setId}/
      const targets = contents.map(o => o.Key).filter(k => typeof k === 'string' && matchRe.test(k));
      if (targets.length) {
        const Objects = targets.slice(0, limitPage).map(Key => ({ Key }));
        await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects } }));
        deleted += Objects.length;
        if (deleted >= limitAll) break;
      }

      if (listed.IsTruncated && listed.NextContinuationToken) {
        ContinuationToken = listed.NextContinuationToken;
      } else {
        break;
      }
      // Safety: avoid infinite loops
      if (rounds > 100) break;
    }

    return res.status(200).json({ ok: true, deleted, setId: safeSetId });
  } catch (error) {
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error?.message || 'delete-by-set failed' });
  }
}
