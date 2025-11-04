// Server-side quota helpers for Cloudflare R2 free tier caps
// Limits (monthly):
// - storage: <= 10 GB (approx by current total stored bytes)
// - Class A ops (write-like): <= 1,000,000
// - Class B ops (read-like): <= 10,000,000

const DEFAULTS = {
  MAX_STORAGE_BYTES: 10 * 1024 * 1024 * 1024, // 10 GB
  MAX_CLASS_A_OPS: 1_000_000,
  MAX_CLASS_B_OPS: 10_000_000,
};

function monthKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}${m}`; // e.g., 202511
}

function limitsFromEnv() {
  const n = (k, def) => {
    const v = process.env[k];
    if (!v) return def;
    const p = parseInt(v, 10);
    return Number.isFinite(p) ? p : def;
  };
  return {
    MAX_STORAGE_BYTES: n('R2_MAX_STORAGE_BYTES', DEFAULTS.MAX_STORAGE_BYTES),
    MAX_CLASS_A_OPS: n('R2_MAX_CLASS_A_OPS', DEFAULTS.MAX_CLASS_A_OPS),
    MAX_CLASS_B_OPS: n('R2_MAX_CLASS_B_OPS', DEFAULTS.MAX_CLASS_B_OPS),
  };
}

async function getAdmin() {
  try {
    const mod = await import('../supabaseAdmin.js');
    return mod?.supabase || mod?.supabaseAdmin;
  } catch {
    return null;
  }
}

async function ensureRow(client, mk) {
  try {
    // Upsert empty row if missing
    await client.from('asset_usage_quota').upsert({ month_key: mk }, { onConflict: 'month_key', ignoreDuplicates: false });
  } catch {}
}

export async function getQuota() {
  const mk = monthKey();
  const limits = limitsFromEnv();
  const admin = await getAdmin();
  if (!admin) return { mk, limits, counters: { class_a_ops: 0, class_b_ops: 0, storage_bytes: 0 } };
  await ensureRow(admin, mk);
  const { data, error } = await admin.from('asset_usage_quota').select('class_a_ops, class_b_ops, storage_bytes').eq('month_key', mk).maybeSingle();
  const counters = (!error && data) ? data : { class_a_ops: 0, class_b_ops: 0, storage_bytes: 0 };
  return { mk, limits, counters };
}

export async function incClassA(delta = 1) {
  const admin = await getAdmin(); if (!admin) return;
  const mk = monthKey();
  await ensureRow(admin, mk);
  try {
    await admin.rpc('increment_quota_counter', { p_month_key: mk, p_field: 'class_a_ops', p_delta: delta });
  } catch {
    // Fallback if RPC not present: naive read-then-update
    const { data } = await admin.from('asset_usage_quota').select('class_a_ops').eq('month_key', mk).maybeSingle();
    const cur = data?.class_a_ops || 0;
    await admin.from('asset_usage_quota').update({ class_a_ops: cur + delta, updated_at: new Date().toISOString() }).eq('month_key', mk);
  }
}

export async function incClassB(delta = 1) {
  const admin = await getAdmin(); if (!admin) return;
  const mk = monthKey();
  await ensureRow(admin, mk);
  try {
    await admin.rpc('increment_quota_counter', { p_month_key: mk, p_field: 'class_b_ops', p_delta: delta });
  } catch {
    const { data } = await admin.from('asset_usage_quota').select('class_b_ops').eq('month_key', mk).maybeSingle();
    const cur = data?.class_b_ops || 0;
    await admin.from('asset_usage_quota').update({ class_b_ops: cur + delta, updated_at: new Date().toISOString() }).eq('month_key', mk);
  }
}

export async function addStorageBytes(delta = 0) {
  const admin = await getAdmin(); if (!admin) return;
  const mk = monthKey();
  await ensureRow(admin, mk);
  try {
    await admin.rpc('increment_quota_counter', { p_month_key: mk, p_field: 'storage_bytes', p_delta: delta });
  } catch {
    const { data } = await admin.from('asset_usage_quota').select('storage_bytes').eq('month_key', mk).maybeSingle();
    const cur = data?.storage_bytes || 0;
    await admin.from('asset_usage_quota').update({ storage_bytes: cur + delta, updated_at: new Date().toISOString() }).eq('month_key', mk);
  }
}

export async function decStorageBytes(delta = 0) {
  const n = Number(delta) || 0;
  if (!n) return;
  await addStorageBytes(-Math.abs(n));
}

export async function enforceBeforeClassA({ size = 0 } = {}) {
  const { limits, counters } = await getQuota();
  // Enforce operation count
  if (counters.class_a_ops + 1 > limits.MAX_CLASS_A_OPS) {
    const err = new Error('R2 class A ops monthly quota exceeded');
    err.statusCode = 429; err.code = 'quota_class_a'; throw err;
  }
  // Enforce storage cap if size is known
  if (size && (counters.storage_bytes + size > limits.MAX_STORAGE_BYTES)) {
    const err = new Error('R2 storage quota would be exceeded by this upload');
    err.statusCode = 403; err.code = 'quota_storage'; throw err;
  }
}

export async function enforceAndCountClassB() {
  const { limits, counters } = await getQuota();
  if (counters.class_b_ops + 1 > limits.MAX_CLASS_B_OPS) {
    const err = new Error('R2 class B ops monthly quota exceeded');
    err.statusCode = 429; err.code = 'quota_class_b'; throw err;
  }
  await incClassB(1);
}

// Optional: assets table size reconciliation on commit
export async function reconcileStorageOnCommit({ hash, size }) {
  const admin = await getAdmin(); if (!admin) return;
  try {
    if (!hash) return;
    const { data, error } = await admin.from('assets').select('hash, size').eq('hash', hash).maybeSingle();
    if (!error && data) {
      // Duplicate content; assume no additional storage (dedup by hash)
      return;
    }
    if (size && size > 0) await addStorageBytes(size);
  } catch {}
}
