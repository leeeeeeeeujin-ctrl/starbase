// Lightweight asset loader with caching for images/audio/json.

const cache = new Map();

export async function loadImage(url) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
  cache.set(url, p);
  return p;
}

export async function loadJSON(url, options) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url, options).then((r) => {
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    return r.json();
  });
  cache.set(url, p);
  return p;
}

export async function loadText(url, options) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url, options).then((r) => {
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    return r.text();
  });
  cache.set(url, p);
  return p;
}

export async function loadAudio(url) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("canplaythrough", () => resolve(audio), { once: true });
    audio.addEventListener("error", reject, { once: true });
    audio.src = url;
  });
  cache.set(url, p);
  return p;
}

export function clearCache() {
  cache.clear();
}

export async function loadPack(baseUrl, manifest) {
  // manifest: { images: { key: path }, audio: { key: path }, json: { key: path } }
  const out = { images: {}, audio: {}, json: {} };
  const tasks = [];
  for (const [k, p] of Object.entries(manifest.images || {})) {
    tasks.push(loadImage(baseUrl + p).then((img) => (out.images[k] = img)));
  }
  for (const [k, p] of Object.entries(manifest.audio || {})) {
    tasks.push(loadAudio(baseUrl + p).then((a) => (out.audio[k] = a)));
  }
  for (const [k, p] of Object.entries(manifest.json || {})) {
    tasks.push(loadJSON(baseUrl + p).then((j) => (out.json[k] = j)));
  }
  await Promise.all(tasks);
  return out;
}

