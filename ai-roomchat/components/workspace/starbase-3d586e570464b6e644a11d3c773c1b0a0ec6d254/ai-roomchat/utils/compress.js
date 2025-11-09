"use client";

// Simple compression helpers using Web CompressionStream when available.
// Falls back to plain text passthrough (no compression) if not supported.

export async function compressString(str) {
  try {
    if (typeof CompressionStream === 'undefined') return { algo: 'none', data: utf8ToBase64(str), rawLen: str.length, compLen: str.length };
    const enc = new TextEncoder();
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    await writer.write(enc.encode(str));
    await writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    const b64 = arrayBufferToBase64(buf);
    return { algo: 'gzip', data: b64, rawLen: str.length, compLen: buf.byteLength };
  } catch {
    return { algo: 'none', data: utf8ToBase64(str), rawLen: str.length, compLen: str.length };
  }
}

export async function decompressToString(meta) {
  try {
    if (!meta) return '';
    if (!meta.algo || meta.algo === 'none') return base64ToUtf8(meta.data || '');
    if (meta.algo === 'gzip') {
      if (typeof DecompressionStream === 'undefined') return base64ToUtf8(meta.data || '');
      const buf = base64ToArrayBuffer(meta.data || '');
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      await writer.write(new Uint8Array(buf));
      await writer.close();
      const out = await new Response(ds.readable).arrayBuffer();
      const dec = new TextDecoder();
      return dec.decode(out);
    }
    return base64ToUtf8(meta.data || '');
  } catch {
    return '';
  }
}

export function arrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function utf8ToBase64(s) {
  return btoa(unescape(encodeURIComponent(s)));
}

export function base64ToUtf8(b) {
  try { return decodeURIComponent(escape(atob(b))); } catch { return ''; }
}

