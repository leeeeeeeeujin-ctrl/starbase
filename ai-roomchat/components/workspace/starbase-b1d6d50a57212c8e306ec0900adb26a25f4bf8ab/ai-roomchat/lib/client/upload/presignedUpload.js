'use client';

export async function requestPresignedUrl({ contentType, ext, folder, size, cacheControl }) {
  const resp = await fetch('/api/storage/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType, ext, folder, size, cacheControl }),
  });
  if (!resp.ok) throw new Error(`presign failed: ${resp.status}`);
  return resp.json();
}

export async function uploadWithPresigned(url, file) {
  const abort = new AbortController();
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
    signal: abort.signal,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return { ok: true };
}
