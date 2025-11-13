// GitHub webhook receiver -> broadcasts events to SSE
import crypto from 'crypto';
import bus from '../../../lib/github/eventBus';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(buf, signature) {
  const secret = process.env.GH_WEBHOOK_SECRET;
  if (!secret) return true; // if not set, skip
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(buf);
  const digest = `sha256=${hmac.digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }
  const sig = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'] || 'unknown';
  const buf = await readRawBody(req);
  if (!verifySignature(buf, sig)) {
    return res.status(401).json({ ok: false, error: 'invalid_signature' });
  }
  let json;
  try { json = JSON.parse(buf.toString('utf8')); } catch { json = null; }
  const repo = json?.repository?.full_name;
  const payload = { type: event, repo, setId: json?.installation?.id || null, raw: json };

  // Broadcast to SSE
  bus.emit('gh:event', payload);

  // Optional persistence
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE;
    if (url && key) {
      const supa = createClient(url, key, { auth: { persistSession: false } });
      const userId = json?.sender?.id ? null : null; // unknown sender mapping; store without user for now
      await supa.from('gh_inbox_snapshots').insert({
        user_id: userId, // nullable in schema would be ideal; schema currently not null
        repo: repo || 'unknown',
        ref: json?.ref || null,
        kind: String(event),
        payload: json || {},
      });
    }
  } catch (_) {
    // best-effort, ignore errors
  }

  return res.status(200).json({ ok: true });
}
