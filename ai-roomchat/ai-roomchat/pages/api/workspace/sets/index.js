import { getIdempotent, ensureIdempotent, upsertSet } from '@/lib/workspace/setStore';

export default async function handler(req, res){
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end('Method Not Allowed'); }
  try {
    const reqId = String(req.headers['x-request-id'] || '').trim();
    const hit = getIdempotent(reqId);
    if (hit) return res.status(200).json({ etag: hit.etag, id: hit.id });
    const { id, files = [], meta = {} } = req.body || {};
    if (!id) return res.status(400).json({ error: 'missing-id' });
    const saved = upsertSet(String(id), Array.isArray(files)? files : [], (meta && typeof meta==='object')? meta : {});
    ensureIdempotent(reqId, saved);
    return res.status(200).json({ etag: saved.etag, id: saved.id });
  } catch (e) {
    try { console.warn('[sets.create] error', e?.message||e); } catch {}
    return res.status(500).json({ error: 'sets-create-failed' });
  }
}

export const config = { runtime: 'nodejs' };

