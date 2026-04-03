import { uploadAsset } from './uploader';

function toBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function generateCutoutFile(file, baseName) {
  const response = await fetch('/api/hero-assets/generate-cutout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      dataBase64: toBase64(await file.arrayBuffer()),
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.dataBase64) {
    throw new Error(payload?.detail || payload?.error || 'cutout_generation_failed');
  }
  const binary = atob(payload.dataBase64);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }
  return new File([output], `${baseName || 'hero'}-ingame.png`, {
    type: payload.mimeType || 'image/png',
  });
}

export async function generateHeroCutoutPreview(file) {
  const cutoutFile = await generateCutoutFile(file, 'hero-preview');
  return URL.createObjectURL(cutoutFile);
}

export async function uploadHeroImageBundle(file, baseName, options = {}) {
  const original = await uploadAsset(file, options);
  try {
    const cutoutFile = await generateCutoutFile(file, baseName);
    const ingame = await uploadAsset(cutoutFile, options);
    return {
      imageUrl: original.url,
      ingameImageUrl: ingame.url,
    };
  } catch (error) {
    try {
      await fetch('/api/storage/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: original.url }),
      });
    } catch (_) {
      // ignore cleanup failure
    }
    throw error;
  }
}
