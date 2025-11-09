import { getSet, saveSet } from '@/lib/workspace/setStore';
import { dbGetSet, dbPutSet } from '@/lib/workspace/dbWorkspaceSets';
import { buildStarterPack } from '@/lib/workspace/getStarterPackFiles';
import path from 'path';

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'missing-id' });
  const method = req.method;
  try {
    if (method === 'GET') {
      // Prefer DB-backed set
      const dbSet = await dbGetSet(id);
      if (dbSet) {
        try { if (dbSet.etag) res.setHeader('ETag', dbSet.etag); } catch {}
        return res.status(200).json(dbSet);
      }
      const cur = getSet(id);
      if (process.env.NODE_ENV !== 'production') try { console.log('[sets.get] id=%s found=%s (mem)', id, !!cur); } catch {}
      if (!cur) return res.status(404).json({ error: 'not-found' });
      try { if (cur.etag) res.setHeader('ETag', cur.etag); } catch {}
      return res.status(200).json(cur);
    }
    if (method === 'PUT') {
      const ifMatch = String(req.headers['if-match'] || '').trim();
      if (!ifMatch) {
        return res.status(428).json({ error: 'precondition-required' });
      }
      const body = req.body || {};
      const files = Array.isArray(body.files) ? body.files : [];
      const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
      // Try DB path first
      const dbRes = await dbPutSet(id, files, meta, ifMatch);
      if (dbRes && typeof dbRes.status === 'number' && dbRes.status !== 503) {
        if (dbRes.status === 200) { try { res.setHeader('ETag', dbRes.etag || ''); } catch {} }
        if (dbRes.status === 412) return res.status(412).json({ error: 'etag-mismatch', current: dbRes.current || null });
        if (dbRes.status === 404) return res.status(404).json({ error: 'not-found' });
        if (dbRes.status === 200) return res.status(200).json({ etag: dbRes.etag || null });
        return res.status(500).json({ error: 'sets-failed' });
      }
      // Fallback to in-memory store
      const cur = getSet(id);
      if (process.env.NODE_ENV !== 'production') try { console.log('[sets.put:mem] id=%s ifMatch=%s current=%s', id, ifMatch||'-', cur?.etag||'-'); } catch {}
      if (cur && ifMatch && cur.etag && cur.etag !== ifMatch) {
        return res.status(412).json({ error: 'etag-mismatch', current: cur.etag });
      }
      const saved = saveSet(id, files, meta);
      if (process.env.NODE_ENV !== 'production') try { console.log('[sets.put:mem] saved id=%s files=%d etag=%s', id, Array.isArray(files)?files.length:0, saved.etag); } catch {}
      try { if (saved.etag) res.setHeader('ETag', saved.etag); } catch {}
      return res.status(200).json({ etag: saved.etag });
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') try { console.warn('[sets.api] error %s', e?.message||e); } catch {}
    return res.status(500).json({ error: 'sets-failed' });
  }
  res.setHeader('Allow', 'GET,PUT');
  return res.status(405).end('Method Not Allowed');
}

export const config = { runtime: 'nodejs' };
