// POST /api/workspace/reference-select
// Body: {
//   packs: string[],                 // e.g., ["universal-basics", "foo"]
//   includePrefixes?: string[],      // relative to pack root; path prefix matches
//   includeExact?: string[],         // exact relative paths
//   excludePrefixes?: string[],
//   maxFiles?: number,               // default 50
// }
// Returns { files: [{ path, content }] } mounting under Reference/<pack>/...

import fs from 'fs';
import path from 'path';

const MAX_SIZE = 256 * 1024; // 256KB
const ALLOWED_EXT = new Set(['.json', '.js', '.md', '.txt']);

function safeReadDir(dir) { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } }

function gatherAll(root) {
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
      if (!stat || stat.size > MAX_SIZE) continue;
      let content = ''; try { content = fs.readFileSync(absPath, 'utf8'); } catch { continue; }
      out.push({ relPath, content });
    }
  }
  return out;
}

function matches(relPath, { includePrefixes, includeExact, excludePrefixes }) {
  const rp = relPath.startsWith('/') ? relPath.slice(1) : relPath;
  if (Array.isArray(excludePrefixes) && excludePrefixes.some((p) => rp.startsWith(p))) return false;
  if (Array.isArray(includeExact) && includeExact.includes(rp)) return true;
  if (Array.isArray(includePrefixes) && includePrefixes.some((p) => rp.startsWith(p))) return true;
  // If include lists provided but nothing matched, exclude by default
  if ((includePrefixes && includePrefixes.length) || (includeExact && includeExact.length)) return false;
  // If no include lists, allow all
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (process.env.ALLOW_REFERENCE_CONTENT !== '1') {
    return res.status(403).json({
      error: 'Reference content export disabled',
      detail: 'This endpoint is off by default. Use /api/workspace/reference-index to browse structure, or set ALLOW_REFERENCE_CONTENT=1 for local dev only.'
    });
  }
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const packs = Array.isArray(body.packs) ? body.packs.filter(Boolean) : [];
  if (!packs.length) return res.status(400).json({ error: 'packs[] required' });

  const includePrefixes = Array.isArray(body.includePrefixes) ? body.includePrefixes : undefined;
  const includeExact = Array.isArray(body.includeExact) ? body.includeExact : undefined;
  const excludePrefixes = Array.isArray(body.excludePrefixes) ? body.excludePrefixes : undefined;
  const maxFiles = Math.max(1, Math.min(500, Number(body.maxFiles || 50)));

  const repoRoot = path.resolve(process.cwd());
  const files = [];

  for (const id of packs) {
    const roots = [
      path.join(repoRoot, 'reference_data', id),
      path.join(repoRoot, 'ai-roomchat', 'docs', 'reference_data', id),
    ];
    for (const r of roots) {
      if (!fs.existsSync(r)) continue;
      const all = gatherAll(r);
      for (const f of all) {
        if (matches(f.relPath, { includePrefixes, includeExact, excludePrefixes })) {
          const outPath = path.posix.join('Reference', id, f.relPath);
          files.push({ path: outPath, content: f.content });
          if (files.length >= maxFiles) break;
        }
      }
      if (files.length >= maxFiles) break;
    }
    if (files.length >= maxFiles) break;
  }

  return res.status(200).json({ files, count: files.length });
}
