import fs from 'fs';
import path from 'path';

const DIST_ROOT = path.resolve(process.cwd(), '..', 'pokerogue-upstream', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function resolveRequestedPath(rawPath) {
  const parts = Array.isArray(rawPath) ? rawPath : [];
  const requested = parts.length ? path.join(...parts) : 'index.html';
  const normalized = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  return normalized || 'index.html';
}

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

export const config = {
  api: {
    responseLimit: false,
  },
};

export default function handler(req, res) {
  if (!fs.existsSync(DIST_ROOT)) {
    res.status(404).json({
      ok: false,
      error: 'pokerogue_upstream_dist_missing',
      distRoot: DIST_ROOT,
    });
    return;
  }

  const requestedPath = resolveRequestedPath(req.query.path);
  let filePath = path.resolve(DIST_ROOT, requestedPath);

  if (!filePath.startsWith(DIST_ROOT)) {
    res.status(400).json({ ok: false, error: 'invalid_path' });
    return;
  }

  if (!fs.existsSync(filePath)) {
    if (!path.extname(filePath)) {
      const htmlCandidate = `${filePath}.html`;
      filePath = fs.existsSync(htmlCandidate) ? htmlCandidate : path.resolve(DIST_ROOT, 'index.html');
    } else {
      res.status(404).json({ ok: false, error: 'not_found', path: requestedPath });
      return;
    }
  }

  if (fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ ok: false, error: 'not_found', path: requestedPath });
    return;
  }

  const mimeType = getMimeType(filePath);
  const payload = fs.readFileSync(filePath);

  res.setHeader(
    'Cache-Control',
    mimeType.includes('text/html') ? 'no-store' : 'public, max-age=31536000, immutable'
  );
  res.setHeader('Content-Type', mimeType);
  res.status(200).send(payload);
}
