import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Optional table name; if absent we operate in memory fallback.
const TABLE = 'rank_offload_metrics';
// In-memory ring buffer fallback (non-persistent)
const memoryBuffer = [];
const MEMORY_LIMIT = 200;

function isAuthorized(req) {
  const headerPass = req.headers['x-admin-password'];
  const envPass = process.env.ADMIN_PORTAL_PASSWORD;
  if (!envPass) return false;
  return headerPass && String(headerPass) === String(envPass);
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    try {
      const payload = req.body || {};
      const row = {
        collected_at: new Date().toISOString(),
        counts: payload.counts || null,
        avg_duration_ms: payload.avgDurationMs || null,
        reasons: payload.reasons || null,
        client_version: payload.clientVersion || null,
        note: payload.note || null,
      };
      let stored = false;
      if (supabaseAdmin && supabaseAdmin.from) {
        try {
          const { error } = await supabaseAdmin.from(TABLE).insert({
            collected_at: row.collected_at,
            counts: row.counts,
            avg_duration_ms: row.avg_duration_ms,
            reasons: row.reasons,
            client_version: row.client_version,
            note: row.note,
          });
          if (!error) stored = true;
        } catch (e) {
          // fall through to memory
        }
      }
      if (!stored) {
        memoryBuffer.push(row);
        if (memoryBuffer.length > MEMORY_LIMIT) memoryBuffer.shift();
      }
      return res.status(200).json({ ok: true, stored, row });
    } catch (e) {
      return res.status(500).json({ error: 'store_failed', detail: e.message });
    }
  } else if (req.method === 'GET') {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    try {
      let rows = [];
      let usedMemoryFallback = false;
      if (supabaseAdmin && supabaseAdmin.from) {
        try {
          const { data, error } = await supabaseAdmin
            .from(TABLE)
            .select('id, collected_at, counts, avg_duration_ms, reasons, client_version, note')
            .order('collected_at', { ascending: false })
            .limit(200);
          if (!error && Array.isArray(data)) {
            rows = data;
          } else {
            usedMemoryFallback = true;
          }
        } catch (e) {
          usedMemoryFallback = true;
        }
      } else {
        usedMemoryFallback = true;
      }
      if (usedMemoryFallback) {
        rows = memoryBuffer.slice().reverse();
      }
      return res.status(200).json({ ok: true, rows, memoryFallback: usedMemoryFallback });
    } catch (e) {
      return res.status(500).json({ error: 'list_failed', detail: e.message });
    }
  } else if (req.method === 'DELETE') {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    memoryBuffer.length = 0;
    return res.status(200).json({ ok: true });
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).json({ error: 'method_not_allowed' });
  }
}
