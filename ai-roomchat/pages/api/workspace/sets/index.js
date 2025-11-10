// Create or list workspace sets (in-memory dev store).

import { create, list } from '../../../../lib/workspace/setsStore';

export const config = { api: { bodyParser: true } };

function json(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, { items: list() });
  }
  if (req.method === 'POST') {
    try {
      const { id, files, meta } = req.body || {};
      if (!id) return json(res, 400, { error: 'id is required' });
      const out = create(id, { files, meta });
      if (out?.etag) res.setHeader('ETag', out.etag);
      return json(res, 200, out);
    } catch (e) {
      return json(res, 500, { error: e.message || String(e) });
    }
  }
  res.setHeader('Allow', 'GET, POST');
  return json(res, 405, { error: 'Method Not Allowed' });
}
