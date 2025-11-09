import { getSupabaseAdmin } from '../../server/supabaseAdmin.js';

// Placeholder R2 fetchers — not implemented to avoid extra deps.
async function r2GetObject(/* key */) {
  return { status: 501, error: 'R2 not configured' };
}
async function r2PutObject(/* key, body */) {
  return { status: 501, error: 'R2 not configured' };
}

function blobKeyFor(id) { return `sets/${id}.json`; }

export function supabaseR2Store() {
  const sb = getSupabaseAdmin();
  return {
    async get(id) {
      if (!sb) return { status: 501, error: 'Supabase not configured' };
      const key = blobKeyFor(id);
      // Try R2 first (files)
      const r2 = await r2GetObject(key);
      if (r2.status === 404) return null;
      if (r2.status && r2.status !== 200) return { status: r2.status, error: r2.error || 'R2 error' };
      // Minimal: if R2 unavailable, fall back to null
      return null;
    },
    async create(id) {
      if (!sb) return { status: 501, error: 'Supabase not configured' };
      const key = blobKeyFor(id);
      try {
        await sb.from('prompt_sets').upsert({ id, name: id, blob_key: key }, { onConflict: 'id' });
      } catch {}
      // Optionally create empty object in R2
      await r2PutObject(key, '{}');
      return { ok: true };
    },
    async put(id, files, ifMatch) {
      if (!sb) return { status: 501, error: 'Supabase not configured' };
      // Without R2 implemented, signal not implemented
      return { error: 'not_implemented', code: 501 };
    },
  };
}

