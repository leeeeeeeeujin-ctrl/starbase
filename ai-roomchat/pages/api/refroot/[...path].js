import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const BASE_DIR = path.join(ROOT, "reference_data");

function safeJoin(base, target) {
  const p = path.join(base, target);
  if (!p.startsWith(base)) throw new Error("Invalid path");
  return p;
}

const MIME = new Map([
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".txt", "text/plain; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
]);

export default async function handler(req, res) {
  const parts = Array.isArray(req.query.path) ? req.query.path : [];
  const rel = parts.join("/");
  try {
    const abs = safeJoin(BASE_DIR, rel);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      const items = fs.readdirSync(abs, { withFileTypes: true }).map(d => ({
        name: d.name,
        type: d.isDirectory() ? 'dir' : 'file',
      }));
      res.status(200).json({ path: rel, items });
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    const mime = MIME.get(ext) || "application/octet-stream";
    res.setHeader("Content-Type", mime);
    const buf = fs.readFileSync(abs);
    res.status(200).send(buf);
  } catch (e) {
    res.status(404).json({ error: "Not found" });
  }
}

export const config = { runtime: 'nodejs' };

