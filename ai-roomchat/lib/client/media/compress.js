'use client';

// Client-side media compressors

export async function compressImage(file, opts = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.82, // JPEG/WebP quality
    mime = 'image/webp',
  } = opts;

  if (!file || !file.type.startsWith('image/')) return file;
  const blob = await fileToImageBlob(file);
  const bitmap = await createImageBitmap(blob);

  const { width, height } = constrain(bitmap.width, bitmap.height, maxWidth, maxHeight);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  const outBlob = await canvas.convertToBlob({ type: mime, quality });
  return new File([outBlob], replaceExt(file.name, mime), { type: mime, lastModified: Date.now() });
}

export async function compressVideo(file, opts = {}) {
  // Best-effort video compression using ffmpeg.wasm (lazy-loaded)
  const {
    targetBitrate = '1200k',
    maxWidth = 1280,
    maxHeight = 720,
    format = 'mp4',
    timeoutMs = 60_000,
  } = opts;
  if (!file || !file.type.startsWith('video/')) return file;

  // Lazy import to avoid heavy bundle cost
  let ffmpeg, fetchFile;
  try {
    const mod = await import(/* webpackIgnore: true */'@ffmpeg/ffmpeg');
    ffmpeg = mod.createFFmpeg({ log: false });
    fetchFile = mod.fetchFile;
  } catch {
    console.warn('[compressVideo] ffmpeg.wasm not available, skipping compression');
    return file;
  }

  const inputName = 'in.' + (file.name.split('.').pop() || 'mp4');
  const outputName = 'out.' + format;
  await ffmpeg.load();
  ffmpeg.FS('writeFile', inputName, await fetchFile(file));

  const args = [
    '-i', inputName,
    '-vf', `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`,
    '-b:v', targetBitrate,
    '-preset', 'fast',
    '-movflags', 'faststart',
    '-c:a', 'aac',
    outputName,
  ];

  await Promise.race([
    ffmpeg.run(...args),
    new Promise((_, rej) => setTimeout(() => rej(new Error('ffmpeg timeout')), timeoutMs)),
  ]);

  const data = ffmpeg.FS('readFile', outputName);
  const blob = new Blob([data.buffer], { type: 'video/' + format });
  return new File([blob], replaceExt(file.name, 'video/' + format), { type: 'video/' + format });
}

function constrain(w, h, maxW, maxH) {
  const ratio = Math.min(maxW / w, maxH / h, 1);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

async function fileToImageBlob(file) {
  if (file.type.startsWith('image/')) return file;
  return new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' });
}

function replaceExt(name, mime) {
  const dot = name.lastIndexOf('.');
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const ext = mimeToExt(mime);
  return base + (ext ? '.' + ext : '');
}

function mimeToExt(m) {
  if (!m) return '';
  if (m.includes('webp')) return 'webp';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('gif')) return 'gif';
  if (m.includes('mp4')) return 'mp4';
  return '';
}
