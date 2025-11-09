// Local client offloading for image compression and simple audio feature extraction.
// Falls back to original file if capability insufficient.
// Image: uses canvas + createImageBitmap + toBlob('image/webp').
// Audio: Web Audio decode + simple frame energy + zero-cross count for quick fingerprint.

import { detectCapabilities } from '@/lib/client/capabilities/detect';

export async function canOffloadImage(caps) {
  return caps?.wasm || caps?.offscreenCanvas || caps?.webcodecs || caps?.webgl2; // broad heuristic
}

export async function offloadImageCompress(file, { maxWidth = 1024, quality = 0.8 } = {}) {
  const caps = await detectCapabilities();
  if (!(await canOffloadImage(caps))) return { blob: file, offloaded: false, reason: 'insufficient_caps' };
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = width > maxWidth ? maxWidth / width : 1;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', quality);
    });
    return { blob, offloaded: true, originalBytes: file.size, newBytes: blob.size, width, height, targetW, targetH };
  } catch (e) {
    return { blob: file, offloaded: false, error: e.message };
  }
}

export async function canOffloadAudio(caps) {
  return typeof AudioContext !== 'undefined';
}

export async function offloadAudioFeatures(file, { frameSize = 2048 } = {}) {
  const caps = await detectCapabilities();
  if (!(await canOffloadAudio(caps))) return { offloaded: false, reason: 'no_audio_context' };
  try {
    const arrayBuffer = await file.arrayBuffer();
    const ac = new AudioContext();
    const audioBuf = await ac.decodeAudioData(arrayBuffer);
    const channel = audioBuf.getChannelData(0);
    const len = channel.length;
    const features = [];
    for (let i = 0; i < len; i += frameSize) {
      let energy = 0, zeroCross = 0;
      let prev = channel[i];
      for (let j = i; j < Math.min(i + frameSize, len); j++) {
        const v = channel[j];
        energy += v * v;
        if ((prev >= 0 && v < 0) || (prev < 0 && v >= 0)) zeroCross++;
        prev = v;
      }
      features.push({ frame: i / frameSize, energy: energy / frameSize, zeroCross });
    }
    ac.close();
    return { offloaded: true, frames: features.length, features };
  } catch (e) {
    return { offloaded: false, error: e.message };
  }
}
