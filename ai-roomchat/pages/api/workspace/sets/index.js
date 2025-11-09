import { getSet, saveSet, getIdempotent, ensureIdempotent } from '@/lib/workspace/setStore';
import { buildStarterPack } from '@/lib/workspace/getStarterPackFiles';
import { supabase as supabaseAdmin } from '@/lib/supabaseAdmin';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }
  try {
    const reqId = req.headers['x-request-id'] || req.headers['x-idempotency-key'] || '';
    if (process.env.NODE_ENV !== 'production') try { console.log('[sets.create] reqId=%s', reqId||'-'); } catch {}
    const cached = getIdempotent(reqId);
    if (cached) return res.status(201).json(cached);

    const body = req.body || {};
    const id = String(body.id || '').trim() || (Math.random().toString(36).slice(2, 10));
    const exists = getSet(id);
    if (process.env.NODE_ENV !== 'production') try { console.log('[sets.create] incoming id=%s exists=%s', id, !!exists); } catch {}
    if (exists) {
      ensureIdempotent(reqId, exists);
      return res.status(201).json(exists);
    }

    // Build starter pack once on create if files not provided
    let files = Array.isArray(body.files) ? body.files : null;
    if (!files || files.length === 0) {
      const base = path.join(process.cwd(), 'ai-roomchat');
      files = buildStarterPack(base);
    }
    const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
    // If Supabase persistence enabled, store in DB
    if (process.env.USE_SUPABASE_SETS === '1' && supabaseAdmin && supabaseAdmin.from) {
      try {
        // idempotent: return existing if present
        const sel = await supabaseAdmin.from('workspace_sets').select('*').eq('id', id).single();
        if (!sel.error && sel.data) {
          ensureIdempotent(reqId, sel.data);
          return res.status(201).json(sel.data);
        }
      } catch {}
      const etag = new Date().toISOString();
      const ins = await supabaseAdmin
        .from('workspace_sets')
        .insert([{ id, files, etag, updated_at: new Date().toISOString(), meta }])
        .select()
        .single();
      if (!ins.error && ins.data) {
        ensureIdempotent(reqId, ins.data);
        return res.status(201).json(ins.data);
      }
    }

    const record = saveSet(id, files, { ...meta, starterApplied: true });
    if (process.env.NODE_ENV !== 'production') try { console.log('[sets.create] created id=%s files=%d', record.id, Array.isArray(files)?files.length:0); } catch {}
    ensureIdempotent(reqId, record);
    return res.status(201).json(record);
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') try { console.warn('[sets.create] error %s', e?.message||e); } catch {}
    return res.status(500).json({ error: 'sets-create-failed' });
  }
}

export const config = { runtime: 'nodejs' };
