// POST /api/workspace/sets -> create a new workspace set (in-memory store by default)
// Optional body: { id?: string, files?: Array<{path, content}> }

import { randomUUID } from 'crypto';
import { createSet } from '../../../../lib/workspaceSetsStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id = body.id || randomUUID();
    const files = Array.isArray(body.files) ? body.files : [];
    const record = createSet({ id, files });
    res.setHeader('ETag', record.etag);
    return res.status(201).json({ id: record.id, etag: record.etag, files: record.files, createdAt: record.createdAt });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid request', detail: e?.message });
  }
}

