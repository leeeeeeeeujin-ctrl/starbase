"use client";

// High-level client uploader for R2 via our API.
// Flow: sha256 -> POST /api/assets/exists -> if !exists then POST /api/assets/upload-url -> PUT -> POST /api/assets/commit

export async function uploadAsset(file, { gameId, key, signal } = {}) {
  if (!file) throw new Error('file required');
  const contentType = file.type || 'application/octet-stream';
  const size = file.size || 0;
  const sha256 = await sha256File(file);

  // 1) exists
  const auth = await bearerOrNull();
  let r = await fetch('/api/assets/exists', { method:'POST', headers: { 'content-type':'application/json', ...(auth?{Authorization:auth}:{}) }, body: JSON.stringify({ hash: sha256 }), signal });
  let j = await r.json();
  if (j?.exists && j?.url) {
    return { url: j.url, key: j.key, hash: sha256, size, mime: contentType, existed: true };
  }

  // 2) upload-url
  const name = file.name || `file_${Date.now()}`;
  const ext = name.includes('.') ? name.split('.').pop() : 'bin';
  const defKey = `games/${gameId||'common'}/${sha256}.${ext}`;
  const finalKey = (typeof key === 'string' && key) ? key : defKey;
  r = await fetch('/api/assets/upload-url', { method:'POST', headers: { 'content-type':'application/json', ...(auth?{Authorization:auth}:{}) }, body: JSON.stringify({ key: finalKey, contentType, size, sha256 }), signal });
  j = await r.json();
  if (!r.ok) throw new Error(j?.error || 'upload-url failed');
  const putUrl = j.url; const headers = j.headers || { 'Content-Type': contentType };

  // 3) PUT file (direct to R2). If CORS blocks, fall back to proxy upload.
  let putOk = false;
  try {
    const put = await fetch(putUrl, { method:'PUT', headers, body: file, signal });
    putOk = put.ok;
  } catch (e) {
    putOk = false;
  }
  if (!putOk) {
    // Fallback: proxy upload via our API to bypass CORS
    const buf = await file.arrayBuffer();
    const b64 = base64FromArrayBuffer(buf);
    const proxy = await fetch('/api/assets/upload', { method:'POST', headers: { 'content-type':'application/json', ...(auth?{Authorization:auth}:{}) }, body: JSON.stringify({ name: file.name, contentType, dataBase64: b64, gameId, sha256 }), signal });
    const pj = await proxy.json();
    if (!proxy.ok) throw new Error(pj?.error || 'proxy upload failed');
    return { url: pj.url, key: pj.key, hash: sha256, size, mime: contentType, existed: false };
  }

  // 4) commit
  const commit = await fetch('/api/assets/commit', { method:'POST', headers: { 'content-type':'application/json', ...(auth?{Authorization:auth}:{}) }, body: JSON.stringify({ key: finalKey, hash: sha256, size, mime: contentType, gameId }), signal });
  const cj = await commit.json();
  if (!commit.ok) throw new Error(cj?.error || 'commit failed');
  return { url: cj.url, key: finalKey, hash: sha256, size, mime: contentType, existed: false };
}

export async function sha256File(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return hex(hash);
}

function hex(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i=0;i<b.length;i++) s += b[i].toString(16).padStart(2,'0');
  return s;
}

function base64FromArrayBuffer(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function bearerOrNull() {
  try {
    // integrate with Supabase auth session if available
    const mod = await import('../lib/supabase');
    const sb = mod?.supabase; if (!sb) return null;
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token; return token ? `Bearer ${token}` : null;
  } catch { return null; }
}
