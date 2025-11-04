"use client";

// High-level client uploader for R2 via our API.
// Flow: sha256 -> POST /api/assets/exists -> if !exists then POST /api/assets/upload-url -> PUT -> POST /api/assets/commit

export async function uploadAsset(file, { gameId, key, signal } = {}) {
  if (!file) throw new Error('file required');
  // Optional client-side compression
  let maybeCompressed = null;
  if (file.type && file.type.startsWith('image/')) {
    maybeCompressed = await tryCompressImage(file);
  } else if (file.type && file.type.startsWith('video/')) {
    maybeCompressed = await tryCompressVideo(file);
  } else if (file.type && file.type.startsWith('audio/')) {
    maybeCompressed = await tryCompressAudio(file);
  }
  file = maybeCompressed || file;
  const contentType = file.type || 'application/octet-stream';
  const size = file.size || 0;
  const sha256 = await sha256File(file);

  // If proxy-first is desired, attempt proxy upload immediately
  const FORCE_PROXY = true; // main path switched to proxy
  if (FORCE_PROXY) {
    try {
      const auth = await bearerOrNull();
      const buf = await file.arrayBuffer();
      const b64 = base64FromArrayBuffer(buf);
      const proxy = await fetch('/api/assets/upload', { method:'POST', headers: { 'content-type':'application/json', ...(auth?{Authorization:auth}:{}) }, body: JSON.stringify({ name: file.name, contentType, dataBase64: b64, gameId, sha256 }), signal });
      const pj = await proxy.json();
      if (!proxy.ok) throw new Error(pj?.error || 'proxy upload failed');
      return { url: pj.url, key: pj.key, hash: sha256, size, mime: contentType, existed: false };
    } catch (e) {
      // fall through to presign flow as backup
    }
  }

  // 1) exists (presign flow)
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

async function tryCompressImage(file) {
  try {
    if (!file || !file.type || !file.type.startsWith('image/')) return null;
    // Skip if already webp and small
    const MAX_BEFORE = 1.2 * 1024 * 1024; // 1.2MB threshold
    if (file.type === 'image/webp' && file.size <= MAX_BEFORE) return null;
    const bmp = await blobToImageBitmap(file);
    const MAX_EDGE = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_IMAGE_MAX_EDGE) ? parseInt(process.env.NEXT_PUBLIC_IMAGE_MAX_EDGE,10) : 2048;
    const QUALITY = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_IMAGE_QUALITY) ? Math.max(0.5, Math.min(0.95, parseFloat(process.env.NEXT_PUBLIC_IMAGE_QUALITY))) : 0.85;
    const { width, height } = limitSize(bmp.width, bmp.height, MAX_EDGE);
    const canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(width, height) : (()=>{ const c = document.createElement('canvas'); c.width=width; c.height=height; return c; })();
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, width, height);
    const blob = (canvas.convertToBlob)
      ? await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY })
      : await new Promise(res => ((canvas instanceof HTMLCanvasElement)? canvas : /** @type {any} */(canvas)).toBlob(res, 'image/webp', QUALITY));
    if (blob.size >= file.size * 0.95) return null; // no gain
    const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp' });
  } catch { return null; }
}

function limitSize(w, h, max) {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = Math.min(max / w, max / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

async function blobToImageBitmap(file) {
  const ab = await file.arrayBuffer();
  const blob = new Blob([ab], { type: file.type });
  return await createImageBitmap(blob);
}

async function tryCompressVideo(file) {
  try {
    if (!file || !file.type || !file.type.startsWith('video/')) return null;
    if (typeof document === 'undefined') return null;
    const URL_ = (typeof URL !== 'undefined') ? URL : null;
    if (!URL_) return null;
    const src = URL_.createObjectURL(file);
    const video = document.createElement('video');
    video.src = src; video.muted = true; video.playsInline = true;
    await new Promise((res, rej) => { video.onloadedmetadata = () => res(); video.onerror = () => rej(new Error('video load failed')); });
    const maxEdge = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_VIDEO_MAX_EDGE) ? parseInt(process.env.NEXT_PUBLIC_VIDEO_MAX_EDGE,10) : 480;
    const { width, height } = limitSize(video.videoWidth || 1280, video.videoHeight || 720, maxEdge);
    const canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(width, height) : (()=>{ const c = document.createElement('canvas'); c.width=width; c.height=height; return c; })();
    const ctx = canvas.getContext('2d');
    const fps = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_VIDEO_FPS) ? Math.max(12, Math.min(30, parseInt(process.env.NEXT_PUBLIC_VIDEO_FPS,10))) : 25;
    const vStream = canvas.captureStream(fps);
    // try to include audio
    let aTrack = null;
    try {
      const vCap = (video.captureStream ? video.captureStream() : (video.mozCaptureStream ? video.mozCaptureStream() : null));
      if (vCap) {
        const aud = vCap.getAudioTracks();
        if (aud && aud.length) aTrack = aud[0];
      }
    } catch {}
    const outStream = new MediaStream([ ...vStream.getVideoTracks(), ...(aTrack?[aTrack]:[]) ]);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : (MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : (MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : ''));
    if (!mime) return null;
    const chunks = [];
    const V_BPS = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_VIDEO_BPS) ? parseInt(process.env.NEXT_PUBLIC_VIDEO_BPS, 10) : 1_200_000;
    const rec = new MediaRecorder(outStream, { mimeType: mime, videoBitsPerSecond: V_BPS });
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => { rec.onstop = () => res(); });
    rec.start(400);
    const start = performance.now();
    const draw = () => {
      if (video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, width, height);
      requestAnimationFrame(draw);
    };
    video.play();
    requestAnimationFrame(draw);
    await new Promise(res => { video.onended = () => res(); });
    rec.stop();
    await done;
    URL_.revokeObjectURL(src);
    const out = new Blob(chunks, { type: mime });
    if (out.size >= file.size * 0.95) return null;
    const name = (file.name || 'video').replace(/\.[^.]+$/, '') + '.webm';
    return new File([out], name, { type: mime });
  } catch { return null; }
}

async function tryCompressAudio(file) {
  try {
    if (!file || !file.type || !file.type.startsWith('audio/')) return null;
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
      // last resort: try direct MediaRecorder if supported
      if (typeof MediaRecorder === 'undefined') return null;
    }
    const AudioCtx = AudioContext || webkitAudioContext;
    const arrayBuf = await file.arrayBuffer();
    const ctx = AudioCtx ? new AudioCtx() : null;
    const audioBuf = ctx ? await ctx.decodeAudioData(arrayBuf.slice(0)) : null;
    const targetHz = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_AUDIO_HZ) ? parseInt(process.env.NEXT_PUBLIC_AUDIO_HZ,10) : 24000;
    const offline = audioBuf ? new OfflineAudioContext(1, Math.ceil(audioBuf.duration * targetHz), targetHz) : null;
    const src = offline.createBufferSource();
    // downmix to mono manually if needed
    if (audioBuf.numberOfChannels > 1) {
      const mono = offline.createBuffer(1, audioBuf.length, audioBuf.sampleRate);
      const ch0 = audioBuf.getChannelData(0);
      const ch1 = audioBuf.getChannelData(1);
      const m = mono.getChannelData(0);
      for (let i=0;i<m.length;i++) m[i] = ((ch0[i]||0)+(ch1[i]||0))/2;
      src.buffer = mono;
    } else {
      src.buffer = audioBuf;
    }
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    // record rendered buffer to opus webm via MediaRecorder
    const real = new AudioCtx();
    const d = real.createMediaStreamDestination();
    const p = real.createBufferSource();
    p.buffer = rendered; p.connect(d); p.start();
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : null));
    if (!mime) return null;
    const rec = new MediaRecorder(d.stream, { mimeType: mime, audioBitsPerSecond: 96_000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => { rec.onstop = () => res(); });
    rec.start(300);
    await new Promise(res => setTimeout(res, rendered.duration * 1000 + 200));
    rec.stop();
    await done;
    const out = new Blob(chunks, { type: mime });
    if (out.size >= file.size * 0.9) return null;
    const name = (file.name || 'audio').replace(/\.[^.]+$/, '') + (mime.includes('ogg')?'.ogg': (mime.includes('mp4')?'.m4a':'.webm'));
    return new File([out], name, { type: mime });
  } catch { return null; }
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
