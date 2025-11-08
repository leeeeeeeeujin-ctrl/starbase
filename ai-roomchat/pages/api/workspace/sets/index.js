import { getSet, saveSet, getIdempotent, ensureIdempotent } from '../../../../lib/workspace/setStore';
import { buildStarterPack } from '../../../../lib/workspace/getStarterPackFiles';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }
  try {
    const reqId = req.headers['x-request-id'] || req.headers['x-idempotency-key'] || '';
    const cached = getIdempotent(reqId);
    if (cached) return res.status(201).json(cached);

    const body = req.body || {};
    const id = String(body.id || '').trim() || (Math.random().toString(36).slice(2, 10));
    const exists = getSet(id);
    if (exists) {
      ensureIdempotent(reqId, exists);
      return res.status(201).json(exists);
    }

    // Build starter pack once on create if files not provided
    let files = Array.isArray(body.files) ? body.files : null;
    if (!files || files.length === 0) {
      const base = path.join(process.cwd(), 'ai-roomchat');
      files = buildStarterPack(base);
    }
    const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
    const record = saveSet(id, files, { ...meta, starterApplied: true });
    ensureIdempotent(reqId, record);
    return res.status(201).json(record);
  } catch (e) {
    return res.status(500).json({ error: 'sets-create-failed' });
  }
}

export const config = { runtime: 'nodejs' };

