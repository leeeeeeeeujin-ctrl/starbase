import { getSet, saveSet } from '../../../../../lib/workspace/setStore';
import { buildStarterPack } from '../../../../../lib/workspace/getStarterPackFiles';
import path from 'path';

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'missing-id' });
  const method = req.method;
  try {
    if (method === 'GET') {
      let cur = getSet(id);
      // Auto-create on first GET with starter pack
      if (!cur) {
        const base = path.join(process.cwd(), 'ai-roomchat');
        const files = buildStarterPack(base);
        cur = saveSet(id, files, { starterApplied: true });
      }
      return res.status(200).json(cur);
    }
    if (method === 'PUT') {
      const ifMatch = String(req.headers['if-match'] || '').trim();
      const body = req.body || {};
      const files = Array.isArray(body.files) ? body.files : [];
      const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
      const cur = getSet(id);
      if (cur && ifMatch && cur.etag && cur.etag !== ifMatch) {
        return res.status(412).json({ error: 'etag-mismatch', current: cur.etag });
      }
      const saved = saveSet(id, files, meta);
      return res.status(200).json({ etag: saved.etag });
    }
  } catch (e) {
    return res.status(500).json({ error: 'sets-failed' });
  }
  res.setHeader('Allow', 'GET,PUT');
  return res.status(405).end('Method Not Allowed');
}

export const config = { runtime: 'nodejs' };

