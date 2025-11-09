// GET /api/workspace/reference-index
// Query: ?id=<pack> (optional)
// Lists packs and file paths without returning file content.

import fs from 'fs';
import path from 'path';

const ALLOWED_EXT = new Set(['.json', '.js', '.md', '.txt']);

function safeReadDir(dir) { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } }

function listPacks(root) {
  return safeReadDir(root).filter(d => d.isDirectory()).map(d => d.name);
}

function gatherTree(root) {
  const out = [];
  const stack = [{ abs: root, rel: '' }];
  while (stack.length) {
    const { abs, rel } = stack.pop();
    for (const ent of safeReadDir(abs)) {
      const absPath = path.join(abs, ent.name);
      const relPath = path.posix.join(rel.replace(/\\/g, '/'), ent.name);
      if (ent.isDirectory()) { stack.push({ abs: absPath, rel: relPath }); continue; }
      const ext = path.extname(ent.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      let stat; try { stat = fs.statSync(absPath); } catch { continue; }
      out.push({ path: relPath, size: stat?.size || 0, ext });
    }
  }
  return out;
}

export default async function handler(req, res) {
  const repoRoot = path.resolve(process.cwd());
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  const roots = [
    path.join(repoRoot, 'reference_data'),
    path.join(repoRoot, 'ai-roomchat', 'docs', 'reference_data'),
  ];

  if (!id) {
    const packs = new Set();
    for (const r of roots) {
      for (const p of listPacks(r)) packs.add(p);
    }
    return res.status(200).json({ packs: Array.from(packs).sort() });
  }

  const tree = [];
  for (const r of roots) {
    const packRoot = path.join(r, id);
    if (!fs.existsSync(packRoot)) continue;
    const files = gatherTree(packRoot);
    for (const f of files) {
      tree.push({ path: path.posix.join('Reference', id, f.path), size: f.size, ext: f.ext });
    }
  }
  return res.status(200).json({ id, files: tree });
}

