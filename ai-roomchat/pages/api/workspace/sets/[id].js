import { getSet, saveSet } from '@/lib/workspace/setStore';
import { buildStarterPack } from '@/lib/workspace/getStarterPackFiles';
import path from 'path';

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'missing-id' });
  const method = req.method;
  try {
    if (method === 'GET') {
      const cur = getSet(id);
      if (process.env.NODE_ENV !== 'production') try { console.log('[sets.get] id=%s found=%s', id, !!cur); } catch {}
      if (!cur) return res.status(404).json({ error: 'not-found' });
      return res.status(200).json(cur);
    }
    if (method === 'PUT') {
      const ifMatch = String(req.headers['if-match'] || '').trim();
      const body = req.body || {};
      const files = Array.isArray(body.files) ? body.files : [];
      const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
      const cur = getSet(id);
      if (process.env.NODE_ENV !== 'production') try { console.log('[sets.put] id=%s ifMatch=%s current=%s', id, ifMatch||'-', cur?.etag||'-'); } catch {}
      if (cur && ifMatch && cur.etag && cur.etag !== ifMatch) {
        return res.status(412).json({ error: 'etag-mismatch', current: cur.etag });
      }
      const saved = saveSet(id, files, meta);
      if (process.env.NODE_ENV !== 'production') try { console.log('[sets.put] saved id=%s files=%d etag=%s', id, Array.isArray(files)?files.length:0, saved.etag); } catch {}
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
