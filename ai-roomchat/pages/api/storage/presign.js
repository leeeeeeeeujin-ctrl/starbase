// Next.js API route to generate a presigned PUT URL for direct-to-R2 upload
// Request: POST { contentType, ext, folder, size, cacheControl }
// Response: { key, url, publicUrl, expiresIn }

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid/non-secure';
import { getR2Client } from '../../../lib/server/r2Client';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      contentType = 'application/octet-stream',
      ext = '',
      folder = 'uploads',
      size = 0,
      cacheControl = 'public, max-age=31536000, immutable',
    } = req.body || {};

    const bucket = process.env.R2_BUCKET;
    const publicBase = process.env.R2_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    if (!bucket) return res.status(500).json({ error: 'Missing R2_BUCKET' });

    // Basic allowlist for top-level folders
    const safeFolder = String(folder).replace(/[^a-zA-Z0-9/_-]/g, '').slice(0, 128) || 'uploads';
    const id = nanoid(16);
    const safeExt = ext ? String(ext).replace(/[^a-zA-Z0-9.]/g, '') : '';
    const key = `${safeFolder}/${new Date().toISOString().slice(0,10)}/${id}${safeExt && !safeExt.startsWith('.') ? '.' : ''}${safeExt}`;

    const client = getR2Client();
    const put = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      CacheControl: cacheControl,
      // Optionally validate size on server via x-amz-meta-size if needed
    });

    // 5 minutes expiry
    const expiresIn = 60 * 5;
    const url = await getSignedUrl(client, put, { expiresIn });
    const publicUrl = publicBase ? `${publicBase}/${key}` : undefined;

    return res.status(200).json({ key, url, publicUrl, expiresIn });
  } catch (err) {
    console.error('[presign] error', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
