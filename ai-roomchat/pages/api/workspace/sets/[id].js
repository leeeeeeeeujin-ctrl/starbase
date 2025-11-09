export const config = { runtime: 'nodejs' };
import { getWorkspaceSetStore } from '../../../../lib/workspace/store/index.js';

function setEtag(res, etag) { if (etag) res.setHeader('ETag', etag); }

export default async function handler(req, res) {
  const { id } = req.query;
  const store = getWorkspaceSetStore();
  if (req.method === 'GET') {
    try {
      const got = await store.get(id);
      if (!got) return res.status(404).end();
      setEtag(res, got.etag || null);
      return res.status(200).json(got.files || {});
    } catch (e) {
      return res.status(500).json({ error: 'get_failed' });
    }
  }
  if (req.method === 'PUT') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const ifMatch = req.headers['if-match'];
      const put = await store.put(id, body, ifMatch);
      if (put && put.code === 428) return res.status(428).json({ error: 'missing set' });
      if (put && put.code === 412) return res.status(412).json({ error: 'etag mismatch' });
      if (put && put.code === 501) return res.status(501).json({ error: 'not_implemented' });
      if (!put || !put.etag) return res.status(500).json({ error: 'put_failed' });
      setEtag(res, put.etag);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: 'put_failed' });
    }
  }
  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).end();
}

