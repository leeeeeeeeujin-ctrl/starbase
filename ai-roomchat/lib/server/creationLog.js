import { getSupabaseAdmin } from './supabaseAdmin.js';

const g = globalThis;
const BUF = (g.__CREATION_LOG_BUF__ ||= []); // ring buffer
const MAX = 200;

export function pushCreationLog(entry) {
  try {
    const e = { ts: Date.now(), ...entry };
    BUF.push(e);
    while (BUF.length > MAX) BUF.shift();
    if (process.env.NODE_ENV !== 'production') {
      try { console.log('[creation-log]', JSON.stringify(e)); } catch {}
    }
    if (process.env.USE_SUPABASE_LOGS === '1') persistToSupabase(e);
  } catch {}
}

export function readCreationLogs(n = 50) {
  const count = BUF.length;
  const items = BUF.slice(Math.max(0, count - n));
  return { count, items };
}

async function persistToSupabase(e) {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    const row = {
      ts: new Date(e.ts).toISOString(),
      kind: e.kind || null,
      location: e.location || null,
      detail: e.detail ? JSON.stringify(e.detail) : null,
      referer: e.referer || null,
      ua: e.ua || null,
    };
    await sb.from('creation_logs').insert(row);
  } catch {}
}

