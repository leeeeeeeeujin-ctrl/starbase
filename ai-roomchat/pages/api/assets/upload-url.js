import { enforceBeforeClassA, incClassA } from '../../../lib/server/quota.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { key, contentType, size, sha256 } = req.body || {};
  if (!key || !contentType) return res.status(400).json({ error: 'key and contentType required' });
  if (typeof size !== 'number' || size <= 0) return res.status(400).json({ error: 'size required' });
  try {
    await enforceBeforeClassA({ size });
    const url = await getSignedPutUrl({ key, contentType, sha256 });
    await incClassA(1);
    const headers = { 'Content-Type': contentType };
    if (sha256) headers['x-amz-meta-sha256'] = sha256;
    return res.json({ url, headers });
  } catch (e) {
    const sc = e?.statusCode || 500;
    return res.status(sc).json({ error: e?.message || 'presign failed', code: e?.code });
  }
}

async function getSignedPutUrl({ key, contentType, sha256 }) {
  // Lazy import AWS SDK so build can proceed even if not needed immediately
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
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
  const Key = key.replace(/^\//,'');
  const cmd = new PutObjectCommand({ Bucket, Key, ContentType: contentType, Metadata: sha256 ? { sha256 } : undefined });
  const url = await getSignedUrl(client, cmd, { expiresIn: 600 }); // 10 minutes
  return url;
}
