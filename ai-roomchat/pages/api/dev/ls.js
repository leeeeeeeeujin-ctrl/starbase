// GET /api/dev/ls?path=
// Lists files/directories under a repo-relative path (text-only metadata).
// Guarded by ALLOW_DEV_FILE_READ=1. Intended for diagnostics only.

import fs from 'fs';
import path from 'path';

function safeStat(p) { try { return fs.statSync(p); } catch { return null; } }
function safeReadDir(p) { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; } }

const ROOT_WHITELIST = new Set(['.', 'ai-roomchat', 'reference_data', 'docs']);

export default async function handler(req, res) {
  if (process.env.ALLOW_DEV_FILE_READ !== '1') {
    return res.status(403).json({ error: 'Disabled', detail: 'Set ALLOW_DEV_FILE_READ=1 for local/staging only.' });
  }
  const q = typeof req.query.path === 'string' ? req.query.path : '.';
  const repoRoot = path.resolve(process.cwd());
  const norm = path.posix.normalize(q.replace(/\\/g, '/'));
  const first = norm.split('/')[0] || '.';
  if (!ROOT_WHITELIST.has(first)) {
    return res.status(400).json({ error: 'Path not allowed' });
  }
  const abs = path.join(repoRoot, norm);
  const st = safeStat(abs);
  if (!st) return res.status(404).json({ error: 'Not Found' });
  if (!st.isDirectory()) {
    return res.status(200).json({ path: norm, type: 'file', size: st.size });
  }
  const entries = safeReadDir(abs).map((d) => {
    const s = safeStat(path.join(abs, d.name));
    return { name: d.name, type: d.isDirectory() ? 'dir' : 'file', size: s?.size || 0 };
  });
  return res.status(200).json({ path: norm, type: 'dir', entries });
}

