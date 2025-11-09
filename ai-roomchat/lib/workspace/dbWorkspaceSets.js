import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

function canUseDb() {
  try {
    // Accessing any property on the proxy throws if not configured
    // So guard with envs too
    return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!(process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY);
  } catch {
    return false;
  }
}

function newEtag() {
  try { return new Date().toISOString(); } catch { return String(Date.now()); }
}

export async function dbGetSet(id) {
  if (!canUseDb()) return null;
  try {
    const { data, error } = await supabase.from('workspace_sets').select('*').eq('id', String(id)).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      files: Array.isArray(data.files) ? data.files : [],
      meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
      etag: data.etag || null,
      updated_at: data.updated_at || null,
    };
  } catch (e) {
    return null;
  }
}

export async function dbCreateIfMissing(id) {
  if (!canUseDb()) return null;
  try {
    const existing = await dbGetSet(id);
    if (existing) return existing;
    const etag = newEtag();
    const payload = { id: String(id), files: [], meta: {}, etag };
    const { data, error } = await supabase.from('workspace_sets').insert(payload).select('*').single();
    if (error) throw error;
    return { id: data.id, files: [], meta: {}, etag: data.etag, updated_at: data.updated_at };
  } catch {
    return null;
  }
}

export async function dbPutSet(id, files = [], meta = {}, ifMatch = null) {
  if (!canUseDb()) return { status: 503 };
  try {
    const cur = await dbGetSet(id);
    if (!cur) {
      // If not exists and no precondition, create
      if (!ifMatch) {
        const created = await dbCreateIfMissing(id);
        return created ? { status: 200, etag: created.etag } : { status: 500 };
      }
      return { status: 404 };
    }
    if (ifMatch && cur.etag && cur.etag !== ifMatch) {
      return { status: 412, current: cur.etag };
    }
    const nextEtag = newEtag();
    const updates = { files: Array.isArray(files) ? files : [], meta: meta && typeof meta === 'object' ? meta : {}, etag: nextEtag };
    const { error } = await supabase.from('workspace_sets').update(updates).eq('id', String(id));
    if (error) throw error;
    return { status: 200, etag: nextEtag };
  } catch (e) {
    return { status: 500 };
  }
}

