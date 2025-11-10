// Workspace set item handler (in-memory dev store).
import { ensure, upsert, remove, create } from '../../../../lib/workspace/setsStore';
import { buildStarterPack } from '../../../../lib/workspace/getStarterPackFiles';

export const config = { api: { bodyParser: true } };

function json(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

const STARTER_ROOT = process.env.WORKSPACE_STARTER_ROOT || process.cwd();
let starterCache = null;

function starterFiles() {
  if (starterCache) return starterCache;
  try {
    const files = buildStarterPack(STARTER_ROOT);
    starterCache = Array.isArray(files) ? files : [];
  } catch {
    starterCache = [];
  }
  return starterCache;
}

function parseIfMatch(req) {
  const raw = req?.headers?.['if-match'];
  if (!raw) return null;
  // Honor first token if multiple values supplied.
  return String(raw).split(',')[0].trim() || null;
}

function ensureWithStarter(id) {
  const existing = ensure(id);
  if (existing) return existing;
  return create(id, { files: starterFiles(), meta: { seeded: true } });
}

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id || Array.isArray(id)) return json(res, 400, { error: 'bad id' });

  if (req.method === 'GET') {
    try {
      const out = ensureWithStarter(id);
      if (out?.etag) res.setHeader('ETag', out.etag);
      return json(res, 200, out);
    } catch (e) {
      return json(res, 500, { error: e.message || 'failed to load set' });
    }
  }
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const ifMatch = parseIfMatch(req);
    const merge = req.method === 'PATCH';
    try {
      const out = upsert(id, req.body || {}, { ifMatch, merge });
      if (out?.etag) res.setHeader('ETag', out.etag);
      return json(res, 200, out);
    } catch (e) {
      if (e.code === 'ETAG_MISMATCH') {
        if (e.currentEtag) res.setHeader('ETag', e.currentEtag);
        return json(res, 412, { error: 'etag mismatch', etag: e.currentEtag || null });
      }
      const status = typeof e.status === 'number' ? e.status : 500;
      return json(res, status, { error: e.message || 'failed to save set' });
    }
  }
  if (req.method === 'DELETE') {
    remove(id);
    return res.status(204).end();
  }
  res.setHeader('Allow', 'GET, PUT, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
