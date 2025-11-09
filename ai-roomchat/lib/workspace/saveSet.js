// Server-first set saver with ETag handling and idempotent create.
// Usage: const newEtag = await saveSet(id, files, etagRef)

function uuid() {
  try {
    // eslint-disable-next-line no-undef
    return crypto.randomUUID();
  } catch (_) {
    return String(Date.now()) + Math.random().toString(16).slice(2);
  }
}

async function getSet(id) {
  const r = await fetch(`/api/workspace/sets/${id}`);
  if (r.status === 404) return { etag: null, files: {} };
  if (!r.ok) throw new Error(`GET set failed ${r.status}`);
  const files = await r.json().catch(() => ({}));
  const etag = r.headers.get('ETag') || null;
  return { etag, files };
}

async function ensureCreated(id) {
  const reqId = uuid();
  await fetch('/api/workspace/sets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': reqId },
    body: JSON.stringify({ id }),
  });
}

async function putSet(id, files, etag) {
  const r = await fetch(`/api/workspace/sets/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': etag || '',
    },
    body: JSON.stringify(files || {}),
  });
  return r;
}

export default async function saveSet(id, files, etagRef) {
  if (!id) throw new Error('saveSet: missing id');
  let known = etagRef && etagRef.current ? etagRef.current : null;
  if (known == null) {
    const g = await getSet(id);
    known = g.etag;
    if (known == null) {
      await ensureCreated(id);
      // retry a GET to obtain an etag for strict PUT
      const g2 = await getSet(id);
      known = g2.etag; // may still be null until first PUT
    }
  }

  let r = await putSet(id, files, known);
  if (r.status === 412) {
    const g = await getSet(id);
    r = await putSet(id, files, g.etag);
  }
  if (!r.ok) throw new Error(`saveSet failed ${r.status}`);
  const newEtag = r.headers.get('ETag') || null;
  if (etagRef) etagRef.current = newEtag;
  return newEtag;
}

