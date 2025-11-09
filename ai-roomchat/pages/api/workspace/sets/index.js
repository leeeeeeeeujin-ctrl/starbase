export const config = { runtime: 'nodejs' };

import { getSet, saveSet as upsertSet } from '@/lib/workspace/setStore';
import { dbCreateIfMissing } from '@/lib/workspace/dbWorkspaceSets';
const SEEN = (globalThis.__SET_REQ_SEEN__ ||= new Set()); // request-id dedupe (idempotency)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  if (process.env.NODE_ENV !== 'production') {
    try {
      const bodyLog = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      console.log('[api/sets] POST', {
        referer: req.headers['referer'] || null,
        ua: req.headers['user-agent'] || null,
        body: bodyLog,
        rid: req.headers['x-request-id'] || null,
      });
    } catch {}
  }

  const rid = req.headers['x-request-id'];
  if (rid && SEEN.has(rid)) {
    return res.status(200).json({ ok: true });
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const { id } = body;
  if (!id) return res.status(400).json({ error: 'missing id' });

  // Prefer DB-backed create-or-get
  let cur = await dbCreateIfMissing(id);
  if (!cur) {
    // Fallback: in-memory
    cur = getSet(id) || upsertSet(id, [], {});
  }
  if (rid) SEEN.add(rid);
  try { if (cur?.etag) res.setHeader('ETag', cur.etag); } catch {}
  return res.status(200).json({ ok: true, etag: cur?.etag || null });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
