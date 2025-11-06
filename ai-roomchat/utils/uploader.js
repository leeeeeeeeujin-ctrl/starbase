"use client";

// High-level client uploader for R2 via our API.
// Flow: sha256 -> POST /api/assets/exists -> if !exists then POST /api/assets/upload-url -> PUT -> POST /api/assets/commit

export async function uploadAsset(file, { gameId, setId, key, signal, contentEncoding } = {}) {
  if (!file) throw new Error('file required');
  // Optional client-side compression for images/videos (logic-only; UI unchanged)
  try {
    if (!contentEncoding && file && typeof file.type === 'string') {
      const mod = await import('../lib/client/media/compress');
      if (file.type.startsWith('image/') && !/gif/i.test(file.type)) {
        if (mod?.compressImage) {
          const compressed = await mod.compressImage(file, {});
          if (compressed && compressed.size > 0) file = compressed;
        }
      } else if (file.type.startsWith('video/')) {
        if (mod?.compressVideo) {
          const compressed = await mod.compressVideo(file, { format: 'mp4' });
          if (compressed && compressed.size > 0) file = compressed;
        }
      } else if (file.type.startsWith('audio/')) {
        if (mod?.compressAudio) {
          const compressed = await mod.compressAudio(file, {});
          if (compressed && compressed.size > 0) file = compressed;
        }
      }
    }
  } catch { /* ignore compression errors */ }

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
  const setPart = setId ? `${String(setId).trim().replace(/[^a-zA-Z0-9_-]/g,'')}/` : '';
  const defKey = `games/${gameId||'common'}/${setPart}${sha256}.${ext}`;
  const finalKey = (typeof key === 'string' && key) ? key : defKey;
  r = await fetch('/api/assets/upload-url', { method:'POST', headers: { 'content-type':'application/json', ...(auth?{Authorization:auth}:{}) }, body: JSON.stringify({ key: finalKey, contentType, size, sha256, contentEncoding }), signal });
  j = await r.json();
  if (!r.ok) {
    maybeShowQuota(j, r.status);
    throw new Error(j?.error || 'upload-url failed');
  }
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
  const proxy = await fetch('/api/assets/upload', { method:'POST', headers: { 'content-type':'application/json', ...(auth?{Authorization:auth}:{}) }, body: JSON.stringify({ name: file.name, contentType, dataBase64: b64, gameId, sha256, key: finalKey }), signal });
    let pj = null;
    try {
      pj = await proxy.json();
    } catch (e) {
      // Non-JSON response (e.g., 404 HTML or 413 text). Surface status and snippet.
      const text = await proxy.text().catch(() => '');
      const snippet = text ? text.slice(0, 120) : '';
      const msg = `proxy upload failed (${proxy.status})${snippet ? `: ${snippet}` : ''}`;
      throw new Error(msg);
    }
    if (!proxy.ok) {
      maybeShowQuota(pj, proxy.status);
      throw new Error(pj?.error || 'proxy upload failed');
    }
    return { url: pj.url, key: pj.key, hash: sha256, size, mime: contentType, existed: false };
  }

  // 4) commit
  const commit = await fetch('/api/assets/commit', { method:'POST', headers: { 'content-type':'application/json', ...(auth?{Authorization:auth}:{}) }, body: JSON.stringify({ key: finalKey, hash: sha256, size, mime: contentType, gameId }), signal });
  const cj = await commit.json();
  if (!commit.ok) {
    maybeShowQuota(cj, commit.status);
    throw new Error(cj?.error || 'commit failed');
  }
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

function maybeShowQuota(body, status) {
  try {
    const code = (body && (body.code || body.error)) || '';
    const msg = String(body && body.error ? body.error : '').toLowerCase();
    const quotaLike = /quota/.test(code) || /quota/.test(msg) || status === 403 || status === 429;
    if (quotaLike && typeof window !== 'undefined') {
      import('../utils/quotaNotice').then(mod => mod?.showQuotaExceeded && mod.showQuotaExceeded());
    }
  } catch {}
}
