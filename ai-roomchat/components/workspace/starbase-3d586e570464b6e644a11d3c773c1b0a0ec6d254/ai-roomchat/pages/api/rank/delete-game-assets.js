// Delete all storage assets for a game: games/{gameId}/**
// Body: { gameId: string, totalLimit?: number, pageSize?: number }
// Auth: Requires Bearer token (basic presence). Ownership validation can be added when supabase admin helpers are wired.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const auth = req.headers.authorization || '';
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const { gameId, totalLimit, pageSize } = req.body || {};
    const raw = String(gameId || '').trim();
    if (!raw) return res.status(400).json({ error: 'gameId required' });
    const safeGameId = raw.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeGameId) return res.status(400).json({ error: 'invalid gameId' });

    const limitAll = Math.max(1, Math.min(Number(totalLimit) || 20000, 50000));
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

    const prefix = `games/${safeGameId}/`;
    let deleted = 0;
    let ContinuationToken = undefined;
    let rounds = 0;

    while (deleted < limitAll) {
      rounds++;
      const listed = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, MaxKeys: limitPage, ContinuationToken }));
      const contents = listed?.Contents || [];
      if (!contents.length) break;
      const targets = contents.map(o => o.Key).filter(k => typeof k === 'string' && k.startsWith(prefix));
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
      if (rounds > 200) break;
    }

    return res.status(200).json({ ok: true, deleted, gameId: safeGameId });
  } catch (e) {
    const status = e?.statusCode || 500;
    return res.status(status).json({ error: e?.message || 'delete-game-assets failed' });
  }
}
