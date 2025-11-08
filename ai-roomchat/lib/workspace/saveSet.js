export async function saveSet(id, filesMap = {}, etag) {
  if (!id) throw new Error('saveSet: missing id');
  const toList = (m) => Object.entries(m || {}).map(([path, meta]) => ({
    path,
    content: String(meta?.content ?? ''),
    readonly: !!meta?.readonly,
    dir: !!meta?.dir,
  }));
  const list = Array.isArray(filesMap) ? filesMap : toList(filesMap);

  // Helper: GET current to fetch etag
  async function getEtag() {
    try {
      const r = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`);
      if (r.ok) { const j = await r.json(); return j?.etag || null; }
      if (r.status === 404) return null;
    } catch {}
    return null;
  }

  // Ensure set exists and have an etag
  let currentEtag = etag || await getEtag();
  if (!currentEtag) {
    // create and capture etag
    try {
      const gen = (p) => { try { return p + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)); } catch { return p + Math.random().toString(36).slice(2); } };
      const reqId = gen('req_');
      const cr = await fetch('/api/workspace/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': reqId },
        body: JSON.stringify({ id })
      });
      if (cr.ok) {
        const cj = await cr.json().catch(()=>({}));
        currentEtag = cj?.etag || null;
      }
    } catch {}
    if (!currentEtag) {
      // last try: GET again
      currentEtag = await getEtag();
    }
  }

  // PUT with If-Match
  const headers = { 'Content-Type': 'application/json' };
  if (currentEtag) headers['If-Match'] = currentEtag;
  const pr = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ files: list, meta: {} })
  });
  const pj = await pr.json().catch(()=>({}));
  if (!pr.ok) {
    const err = new Error(pj?.error || `saveSet failed (${pr.status})`);
    err.status = pr.status;
    throw err;
  }
  return pj?.etag || null;
}

