// Server-side removal of a prompt set with safety checks and storage cleanup.
// Body: { id: string }

import { supabaseAdmin as supabase } from '../../../../lib/supabaseAdmin';

async function deleteR2Prefix(prefix, { client, Bucket }) {
  const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  let deleted = 0;
  let ContinuationToken = undefined;
  let rounds = 0;
  const MaxKeys = 1000;
  // paginate and delete
  while (rounds < 100) {
    rounds += 1;
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket, Prefix: prefix, MaxKeys, ContinuationToken })
    );
    const contents = listed?.Contents || [];
    if (!contents.length) break;
    const Objects = contents.map(o => ({ Key: o.Key })).filter(o => o.Key);
    if (Objects.length) {
      await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects } }));
      deleted += Objects.length;
    }
    if (listed.IsTruncated && listed.NextContinuationToken) {
      ContinuationToken = listed.NextContinuationToken;
    } else {
      break;
    }
  }
  return deleted;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { id: rawId } = req.body || {};
    const id = String(rawId || '').trim();
    if (!id) return res.status(400).json({ error: 'id required' });

    // 1) Block if set is used by any game
    try {
      const { data: usageRows, error: usageError } = await supabase
        .from('rank_games')
        .select('id')
        .eq('prompt_set_id', id)
        .limit(1);
      if (usageError) throw usageError;
      const used = Array.isArray(usageRows) ? usageRows.length > 0 : Boolean(usageRows?.id);
      if (used) {
        return res
          .status(400)
          .json({ error: '현재 게임에 등록된 세트는 삭제할 수 없습니다. 먼저 게임 등록을 해제하세요.' });
      }
    } catch (e) {
      return res
        .status(500)
        .json({ error: '세트 삭제 사전 검사에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
    }

    // 2) Delete DB row
    {
      const { error } = await supabase.from('prompt_sets').delete().eq('id', id);
      if (error) return res.status(500).json({ error: '세트를 삭제하지 못했습니다.' });
    }

    // 3) Best-effort storage cleanup (studio/resources/{id}/ and games/*/{id}/)
    try {
      const { S3Client } = await import('@aws-sdk/client-s3');
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

      // studio/resources/{id}/
      await deleteR2Prefix(`studio/resources/${id}/`, { client, Bucket });

      // games/*/{id}/**
      // iterate under games/ and remove any matching keys
      const matchRe = new RegExp(`^games/[^/]+/${id}/`);
      // reuse deleteR2Prefix by paging through games/ and deleting matched keys in batches
      // (inline implementation similar to delete-by-set)
      const { ListObjectsV2Command, DeleteObjectsCommand } = await import(
        '@aws-sdk/client-s3'
      );
      let deleted = 0;
      let ContinuationToken = undefined;
      let rounds = 0;
      const MaxKeys = 1000;
      while (rounds < 100) {
        rounds += 1;
        const listed = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: 'games/', MaxKeys, ContinuationToken })
        );
        const contents = listed?.Contents || [];
        if (!contents.length) break;
        const targets = contents.map(o => o.Key).filter(k => typeof k === 'string' && matchRe.test(k));
        if (targets.length) {
          const Objects = targets.map(Key => ({ Key }));
          await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects } }));
          deleted += Objects.length;
        }
        if (listed.IsTruncated && listed.NextContinuationToken) {
          ContinuationToken = listed.NextContinuationToken;
        } else {
          break;
        }
      }
    } catch {
      // ignore storage cleanup errors
    }

    return res.status(200).json({ ok: true, id });
  } catch (error) {
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error?.message || 'remove failed' });
  }
}
