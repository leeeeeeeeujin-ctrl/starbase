// GET /api/workspace/reference-pack?id=<pack>
// Collects files from repo-level reference_data/<pack>/ and ai-roomchat/docs/reference_data/<pack>/
// Only returns .json/.js/.md/.txt up to 256KB per file.

import fs from 'fs';
import path from 'path';

const MAX_SIZE = 256 * 1024; // 256KB
const ALLOWED_EXT = new Set(['.json', '.js', '.md', '.txt']);

function safeReadDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

function gatherFiles(root, base) {
  const out = [];
  const stack = [{ abs: root, rel: '' }];
  while (stack.length) {
    const { abs, rel } = stack.pop();
    for (const ent of safeReadDir(abs)) {
      const absPath = path.join(abs, ent.name);
      const relPath = path.posix.join(base, rel.replace(/\\/g, '/'), ent.name);
      if (ent.isDirectory()) {
        stack.push({ abs: absPath, rel: path.posix.join(rel, ent.name) });
        continue;
      }
      const ext = path.extname(ent.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      let stat;
      try { stat = fs.statSync(absPath); } catch { continue; }
      if (!stat || stat.size > MAX_SIZE) continue;
      let content = '';
      try { content = fs.readFileSync(absPath, 'utf8'); } catch { continue; }
      out.push({ path: relPath, content });
    }
  }
  return out;
}

export default async function handler(req, res) {
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (process.env.ALLOW_REFERENCE_CONTENT !== '1') {
    return res.status(403).json({
      error: 'Reference content export disabled',
      detail: 'This endpoint is off by default. Use /api/workspace/reference-index to browse structure, or set ALLOW_REFERENCE_CONTENT=1 for local dev only.'
    });
  }
  const repoRoot = path.resolve(process.cwd());
  const roots = [
    path.join(repoRoot, 'reference_data', id),
    path.join(repoRoot, 'ai-roomchat', 'docs', 'reference_data', id),
  ];
  const files = [];
  for (const r of roots) {
    if (fs.existsSync(r)) {
      const base = path.posix.join('Reference', id);
      files.push(...gatherFiles(r, base));
    }
  }
  return res.status(200).json({ id, files });
}
