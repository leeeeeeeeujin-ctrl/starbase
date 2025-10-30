import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Try to use Supabase (best-effort). If unavailable, fall back to file-backed store.
let supabaseAdmin = null;
try {
  // eslint-disable-next-line import/no-unresolved
  supabaseAdmin = (await import('../../../lib/supabaseAdmin.js')).supabase;
} catch (e) {
  supabaseAdmin = null;
}

const storePath = path.join(process.cwd(), 'ai-roomchat', 'data', 'audit-logs.json');

function readFileStore() {
  try {
    if (!fs.existsSync(storePath)) return {};
    const raw = fs.readFileSync(storePath, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function writeFileStore(obj) {
  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(obj, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write audit file store', e);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const id = body.id || uuidv4();
  const rec = {
    id,
    created_at: new Date().toISOString(),
    actor_id: body.actor_id || null,
    device_id: body.device_id || null,
    prompt_id: body.prompt_id || null,
    action: body.action || 'run',
    input: body.input || null,
    output: body.output || null,
    meta: body.meta || null,
  };

  // Try DB first if supabase admin available
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.from('audit_logs').insert([rec]);
      if (error) throw error;
      return res.status(201).json({ id, stored: 'db' });
    } catch (e) {
      // fall through to file-backed
      console.warn('Supabase insert failed, falling back to file store', String(e));
    }
  }

  // File-backed fallback
  try {
    const store = readFileStore();
    store[id] = rec;
    const ok = writeFileStore(store);
    if (!ok) throw new Error('file write failed');
    return res.status(201).json({ id, stored: 'file' });
  } catch (e) {
    console.error('Audit logging failed', e);
    return res.status(500).json({ error: 'failed to store audit log' });
  }
}
