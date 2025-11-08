import { loadJSON, loadImage, loadAudio, loadText } from "../assets/AssetLoader.js";

const BASE = (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_REFERENCE_BASE) || "/api/reference/";

// Map friendly names to relative paths under BASE.
const MAP = {
  "character.sample": "characters/character.sample.json",
  "characters.min": "characters/min.json",
  "text.scene.sample": "text/scene.sample.json",
  "tilemap.sample": "tilemaps/level1.json",
  "spritesheet.sample": "sprites/spritesheet.png",
};

export function listReferenceKeys() {
  return Object.keys(MAP);
}

export function urlForReference(nameOrPath) {
  if (!nameOrPath) return null;
  const rel = MAP[nameOrPath] || nameOrPath.replace(/^\//, "");
  return BASE.replace(/\/$/, "/") + rel;
}

export async function loadReferenceJSON(nameOrPath) {
  const url = urlForReference(nameOrPath);
  if (!url) throw new Error("Invalid reference key");
  return loadJSON(url);
}

export async function loadReferenceImage(nameOrPath) {
  const url = urlForReference(nameOrPath);
  if (!url) throw new Error("Invalid reference key");
  return loadImage(url);
}

export async function loadReferenceAudio(nameOrPath) {
  const url = urlForReference(nameOrPath);
  if (!url) throw new Error("Invalid reference key");
  return loadAudio(url);
}

export async function loadReferenceText(nameOrPath) {
  const url = urlForReference(nameOrPath);
  if (!url) throw new Error("Invalid reference key");
  return loadText(url);
}

// List directory contents under reference_data via the API directory JSON response.
export async function listReferenceDir(dir = "") {
  const rel = String(dir || "").replace(/^\/+|\/+$/g, "");
  const url = BASE.replace(/\/$/, "/") + rel;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to list ${rel || '/'}: ${res.status}`);
  const json = await res.json();
  return json.items || [];
}
