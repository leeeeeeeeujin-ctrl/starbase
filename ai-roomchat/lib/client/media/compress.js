
'use client';

// Client-side media compressors
import { IMAGE_LIMITS, VIDEO_LIMITS, AUDIO_LIMITS, withinBudget } from '@/config/mediaLimits';

export async function compressImage(file, opts = {}) {
  const {
    maxWidth = IMAGE_LIMITS.maxWidth,
    maxHeight = IMAGE_LIMITS.maxHeight,
    quality = IMAGE_LIMITS.quality, // JPEG/WebP quality
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
  if (!withinBudget(outBlob.size, IMAGE_LIMITS.maxBytes)) {
    // Try one more pass with slightly lower quality if too big
    const fallback = await canvas.convertToBlob({ type: mime, quality: Math.max(0.6, quality - 0.12) });
    if (fallback && withinBudget(fallback.size, IMAGE_LIMITS.maxBytes)) {
      return new File([fallback], replaceExt(file.name, mime), { type: mime, lastModified: Date.now() });
    }
  }
  return new File([outBlob], replaceExt(file.name, mime), { type: mime, lastModified: Date.now() });
}

export async function compressVideo(file, opts = {}) {
  // Best-effort video compression using ffmpeg.wasm (lazy-loaded)
  const {
    targetBitrate = VIDEO_LIMITS.targetBitrate,
    maxWidth = VIDEO_LIMITS.maxWidth,
    maxHeight = VIDEO_LIMITS.maxHeight,
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
  // Best-effort size budget check
  if (!withinBudget(blob.size, VIDEO_LIMITS.maxBytes)) {
    // Try a lower bitrate pass once
    const lower = ['480k', '420k', '360k'];
    for (const b of lower) {
      try {
        await ffmpeg.run(...[
          '-i', inputName,
          '-vf', `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`,
          '-b:v', b,
          '-preset', 'fast',
          '-movflags', 'faststart',
          '-c:a', 'aac',
          outputName,
        ]);
        const d2 = ffmpeg.FS('readFile', outputName);
        const blob2 = new Blob([d2.buffer], { type: 'video/' + format });
        if (withinBudget(blob2.size, VIDEO_LIMITS.maxBytes)) {
          return new File([blob2], replaceExt(file.name, 'video/' + format), { type: 'video/' + format });
        }
      } catch {}
    }
  }
  return new File([blob], replaceExt(file.name, 'video/' + format), { type: 'video/' + format });
}

export async function compressAudio(file, opts = {}) {
  const {
    codec = AUDIO_LIMITS.codec,
    bitrate = AUDIO_LIMITS.bitrate, // e.g., '96k'
    sampleRate = AUDIO_LIMITS.sampleRate, // 44100
    timeoutMs = 60_000,
  } = opts;
  if (!file || !file.type.startsWith('audio/')) return file;

  let ffmpeg, fetchFile;
  try {
    const mod = await import(/* webpackIgnore: true */'@ffmpeg/ffmpeg');
    ffmpeg = mod.createFFmpeg({ log: false });
    fetchFile = mod.fetchFile;
  } catch {
    console.warn('[compressAudio] ffmpeg.wasm not available, skipping');
    return file;
  }

  const inputName = 'in.' + (file.name.split('.').pop() || 'wav');
  const ext = codec === 'mp3' ? 'mp3' : 'm4a';
  const mime = codec === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
  const outputName = 'out.' + ext;
  await ffmpeg.load();
  ffmpeg.FS('writeFile', inputName, await fetchFile(file));

  const args = [
    '-i', inputName,
    '-ar', String(sampleRate),
    ...(codec === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', bitrate] : ['-c:a', 'aac', '-b:a', bitrate]),
    outputName,
  ];

  await Promise.race([
    ffmpeg.run(...args),
    new Promise((_, rej) => setTimeout(() => rej(new Error('ffmpeg timeout')), timeoutMs)),
  ]);

  const data = ffmpeg.FS('readFile', outputName);
  const blob = new Blob([data.buffer], { type: mime });
  return new File([blob], replaceExt(file.name, mime), { type: mime });
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
