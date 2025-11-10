// GET /api/dev/read-file?path=
// Reads a small text file from the repo (<= 256KB). Dev-only, guarded by ALLOW_DEV_FILE_READ=1.

import fs from 'fs';
import path from 'path';

const MAX = 256 * 1024;
const ALLOWED_EXT = new Set(['.js', '.json', '.md', '.txt', '.css', '.ts', '.tsx', '.jsx']);
const ROOT_WHITELIST = new Set(['.', 'ai-roomchat', 'reference_data', 'docs']);

export default async function handler(req, res) {
  if (process.env.ALLOW_DEV_FILE_READ !== '1') {
    return res.status(403).json({ error: 'Disabled', detail: 'Set ALLOW_DEV_FILE_READ=1 for local/staging only.' });
  }
  const p = typeof req.query.path === 'string' ? req.query.path : '';
  if (!p) return res.status(400).json({ error: 'Missing path' });
  const norm = path.posix.normalize(p.replace(/\\/g, '/'));
  const first = norm.split('/')[0] || '.';
  if (!ROOT_WHITELIST.has(first)) return res.status(400).json({ error: 'Path not allowed' });
  const ext = path.extname(norm).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return res.status(400).json({ error: 'Extension not allowed' });
  const abs = path.join(process.cwd(), norm);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Not Found' });
  const stat = fs.statSync(abs);
  if (stat.size > MAX) return res.status(413).json({ error: 'Too large' });
  const content = fs.readFileSync(abs, 'utf8');
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  return res.status(200).send(content);
}

