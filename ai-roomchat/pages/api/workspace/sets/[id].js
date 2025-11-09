// GET /api/workspace/sets/:id -> fetch workspace set
// PUT /api/workspace/sets/:id -> update files with ETag conflict handling (If-Match header)

import { getSet, upsertSet } from '../../../../../lib/workspaceSetsStore';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing id' });
  }
  if (req.method === 'GET') {
    const record = getSet(id);
    if (!record) return res.status(404).json({ error: 'Not Found' });
    res.setHeader('ETag', record.etag);
    return res.status(200).json({ id: record.id, etag: record.etag, files: record.files, createdAt: record.createdAt, updatedAt: record.updatedAt });
  }
  if (req.method === 'PUT') {
    try {
      const ifMatch = req.headers['if-match'];
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const files = Array.isArray(body.files) ? body.files : [];
      const record = upsertSet(id, files, typeof ifMatch === 'string' ? ifMatch : undefined);
      if (!record) return res.status(404).json({ error: 'Not Found' });
      res.setHeader('ETag', record.etag);
      return res.status(200).json({ id: record.id, etag: record.etag, files: record.files, updatedAt: record.updatedAt });
    } catch (e) {
      if (e && e.code === 'ETAG_MISMATCH') {
        return res.status(412).json({ error: 'Precondition Failed', detail: 'ETag mismatch' });
      }
      return res.status(400).json({ error: 'Invalid request', detail: e?.message });
    }
  }
  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method Not Allowed' });
}

