// R2 (S3-compatible) client factory for server-side usage
// Uses AWS SDK v3 against Cloudflare R2 endpoint.

import { S3Client } from '@aws-sdk/client-s3';

export function getR2Client() {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_S3_ENDPOINT,
  } = process.env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Missing R2 credentials in environment');
  }

  const endpoint = R2_S3_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  return new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

export default getR2Client;
