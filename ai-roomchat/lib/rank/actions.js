import { withTableQuery } from '@/lib/supabaseTables';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { z } from 'zod';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { getSet as getSetMem, saveSet as saveSetMem } from '@/lib/workspace/setStore';

const registry = new Map();
const exec = promisify(execCb);

export function registerAction(name, { schema = null, roles = [], handler }) {
  if (!name || typeof handler !== 'function') return;
  registry.set(name, { schema, roles, handler });
}

export async function dispatchAction({
  name,
  user,
  sessionId,
  gameId,
  payload = {},
  idempotencyKey = null,
}) {
  if (!name) return { ok: false, error: 'missing_action' };
  const entry = registry.get(name);
  if (!entry) return { ok: false, error: 'unknown_action' };

  // Basic context passed to handlers
  const ctx = { user, sessionId, gameId, idempotencyKey, supabaseAdmin, withTableQuery };

  try {
    // validate payload if schema provided (expecting zod schema)
    if (entry.schema) {
      try {
        // allow either zod schema or plain object with parse
        if (typeof entry.schema.parse === 'function') {
          payload = entry.schema.parse(payload);
        } else {
          // attempt basic coercion with zod.any()
          payload = z.any().parse(payload);
        }
      } catch (err) {
        return { ok: false, error: 'invalid_payload', detail: err?.message || String(err) };
      }
    }
    const result = await entry.handler(ctx, payload);
    // Ensure consistent shaped result
    if (!result || typeof result !== 'object') {
      return { ok: true, result: { ok: true }, changes: null };
    }
    return { ok: true, result: result, changes: result.changes || null };
  } catch (error) {
    console.error('[actions] handler error', name, error);
    return { ok: false, error: error?.message || 'handler_error' };
  }
}

// Demo handler: award_xp
registerAction('award_xp', {
  schema: z.object({
    ownerId: z.string().uuid().optional(),
    playerId: z.string().uuid().optional(),
    amount: z.number().int().min(1),
  }),
  handler: async (ctx, payload = {}) => {
    const { supabaseAdmin, withTableQuery } = ctx;
    const ownerId = payload?.ownerId || payload?.playerId || null;
    const amount = Number.isFinite(Number(payload?.amount))
      ? Math.floor(Number(payload.amount))
      : 0;

    if (!ownerId || !amount || amount === 0) {
      return { ok: false, error: 'invalid_payload' };
    }

    // Update rank_participants.score (simple POC)
    const { data: updated, error: updateError } = await withTableQuery(
      supabaseAdmin,
      'rank_participants',
      from =>
        supabaseAdmin
          .from(from)
          .update({ score: supabaseAdmin.raw('coalesce(score, 0) + ?', [amount]) })
          .eq('game_id', ctx.gameId)
          .eq('owner_id', ownerId)
          .select('id, owner_id, score')
    );

    if (updateError) {
      throw updateError;
    }

    // Insert audit row in rank_action_logs if table exists (best-effort)
    try {
      await withTableQuery(supabaseAdmin, 'rank_action_logs', from =>
        supabaseAdmin.from(from).insert({
          request_id: ctx.idempotencyKey || null,
          session_id: ctx.sessionId || null,
          user_id: ctx.user?.id || null,
          action_name: 'award_xp',
          payload: payload || {},
          result: updated || null,
          ok: true,
        })
      );
    } catch (err) {
      // ignore audit write errors for POC
      console.warn('[actions] audit insert failed', err?.message || err);
    }

    return { ok: true, changes: { participants: updated } };
  },
});

// --- Workspace stubs (return success but do not mutate server state) ---
// --- Workspace actions (dev in-memory set) ---
function deriveSetId(ctx, payload) {
  // Prefer explicit sessionId, then user-based bucket, fallback to singleton
  const sid = payload?.setId || ctx.sessionId || null;
  if (sid) return `ws:${sid}`;
  const uid = ctx?.user?.id || null;
  return uid ? `ws:user:${uid}` : 'ws:singleton';
}

function normalizePath(p) {
  if (!p && p !== 0) return null;
  const s = String(p).trim();
  if (!s) return null;
  return '/' + s.replace(/^[\\/]+/, '').replace(/\\/g, '/');
}

function upsertFile(record, filePath, content) {
  const path = normalizePath(filePath);
  if (!path) throw new Error('invalid_path');
  const files = Array.isArray(record?.files) ? record.files.slice() : [];
  const idx = files.findIndex((f) => f.path === path);
  if (idx >= 0) files[idx] = { ...files[idx], path, content: String(content ?? '') };
  else files.push({ path, content: String(content ?? '') });
  return { ...record, files, meta: { ...record?.meta } };
}

async function getWorkspaceRecord(id) {
  const key = String(id || 'ws:singleton');
  try {
    const { data, error } = await withTableQuery(
      supabaseAdmin,
      'workspace_sets',
      from => supabaseAdmin.from(from).select('id, files, meta, etag, updated_at').eq('id', key).maybeSingle()
    );
    if (error) throw error;
    if (!data) return getSetMem(key) || null;
    return {
      id: data.id,
      files: Array.isArray(data.files) ? data.files : [],
      meta: data.meta || {},
      etag: data.etag || null,
      updated_at: data.updated_at || null,
    };
  } catch (e) {
    return getSetMem(key) || null;
  }
}

async function saveWorkspaceRecord(id, files = [], meta = {}) {
  const key = String(id || 'ws:singleton');
  // Try remote first
  try {
    const payload = { id: key, files, meta, etag: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { data, error } = await withTableQuery(
      supabaseAdmin,
      'workspace_sets',
      from => supabaseAdmin.from(from).upsert(payload, { onConflict: 'id' }).select('id, files, meta, etag, updated_at').maybeSingle()
    );
    if (error) throw error;
    const row = data || payload;
    return { id: row.id, files: row.files || [], meta: row.meta || {}, etag: row.etag || null, updated_at: row.updated_at || null };
  } catch (e) {
    // Fallback to in-memory
    return saveSetMem(key, files, meta);
  }
}

// --- Unified diff apply (minimal implementation) ---
function parseHunks(diffText) {
  const lines = String(diffText || '').replace(/\r\n/g, '\n').split('\n');
  const hunks = [];
  let i = 0;
  // skip optional headers (---, +++)
  while (i < lines.length && !/^@@ /.test(lines[i])) i++;
  while (i < lines.length) {
    const m = lines[i].match(/^@@\s+-([0-9]+)(?:,([0-9]+))?\s+\+([0-9]+)(?:,([0-9]+))?\s+@@/);
    if (!m) { i++; continue; }
    const h = { aStart: parseInt(m[1], 10), aLen: parseInt(m[2] || '1', 10), bStart: parseInt(m[3], 10), bLen: parseInt(m[4] || '1', 10), lines: [] };
    i++;
    while (i < lines.length && !/^@@ /.test(lines[i])) {
      const ch = lines[i][0];
      if (ch === '+' || ch === '-' || ch === ' ' || ch === '\\') {
        h.lines.push(lines[i]);
      } else if (lines[i].trim() === '') {
        // allow blank context line (consider as space)
        h.lines.push(' ');
      } else {
        // unexpected line; still include
        h.lines.push(lines[i]);
      }
      i++;
    }
    hunks.push(h);
  }
  return hunks;
}

function applyUnifiedDiff(original, diffText) {
  const o = String(original || '').replace(/\r\n/g, '\n').split('\n');
  const hunks = parseHunks(diffText);
  if (!hunks.length) {
    throw new Error('invalid_diff');
  }
  let out = [];
  let cursor = 0;
  for (const h of hunks) {
    const aIdx = Math.max(0, h.aStart - 1);
    // copy unchanged before hunk
    out = out.concat(o.slice(cursor, aIdx));
    let oIndex = aIdx;
    for (const raw of h.lines) {
      const tag = raw[0];
      const text = tag === ' ' || tag === '+' || tag === '-' ? raw.slice(1) : raw;
      if (tag === ' ') {
        if (o[oIndex] !== text) {
          // context mismatch -> fail
          throw new Error('context_mismatch');
        }
        out.push(text);
        oIndex++;
      } else if (tag === '-') {
        if (o[oIndex] !== text) {
          throw new Error('delete_mismatch');
        }
        // skip deletion
        oIndex++;
      } else if (tag === '+') {
        out.push(text);
      } else if (tag === '\\') {
        // line like "\\ No newline at end of file" -> ignore
      } else {
        // treat as context
        if (o[oIndex] !== raw) throw new Error('context_mismatch');
        out.push(raw);
        oIndex++;
      }
    }
    cursor = oIndex;
  }
  out = out.concat(o.slice(cursor));
  return out.join('\n');
}

registerAction('list_files', {
  schema: z.object({ path: z.string().optional() }).optional(),
  handler: async (ctx, payload = {}) => {
    const setId = deriveSetId(ctx, payload);
    const rec = (await getWorkspaceRecord(setId)) || { id: setId, files: [] };
    const prefix = normalizePath(payload?.path || '/');
    const items = (rec.files || [])
      .filter((f) => f && f.path && f.path.startsWith(prefix === '/' ? '/' : prefix))
      .map((f) => ({ path: f.path }));
    return { ok: true, items };
  },
});

registerAction('read_file', {
  schema: z.object({ path: z.string() }),
  handler: async (ctx, payload = {}) => {
    const setId = deriveSetId(ctx, payload);
    const rec = await getWorkspaceRecord(setId);
    const path = normalizePath(payload?.path);
    if (!rec || !path) return { ok: false, error: 'not_found' };
    const f = (rec.files || []).find((x) => x.path === path);
    if (!f) return { ok: false, error: 'not_found' };
    return { ok: true, path, content: String(f.content ?? '') };
  },
});

registerAction('write_file', {
  schema: z.object({ path: z.string(), content: z.string().default('') }),
  handler: async (ctx, payload = {}) => {
    const setId = deriveSetId(ctx, payload);
    const base = (await getWorkspaceRecord(setId)) || { id: setId, files: [], meta: {} };
    const next = upsertFile(base, payload.path, payload.content);
    const saved = await saveWorkspaceRecord(setId, next.files, next.meta);
    const path = normalizePath(payload.path);
    const bytes = Buffer.from(String(payload.content || ''), 'utf8').length;
    return { ok: true, path, bytes, etag: saved.etag };
  },
});

registerAction('edit_patch', {
  schema: z.object({ path: z.string().optional(), diff: z.string() }),
  handler: async (ctx, payload = {}) => {
    // Determine target path: payload.path or from diff headers (---/+++)
    let targetPath = normalizePath(payload?.path || null);
    if (!targetPath) {
      const hdrMatch = String(payload.diff || '').match(/^\+\+\+\s+[ab]\/(.+)$|^---\s+[ab]\/(.+)$/m);
      const candidate = hdrMatch && (hdrMatch[1] || hdrMatch[2]);
      if (candidate) targetPath = normalizePath(candidate);
    }
    if (!targetPath) return { ok: false, error: 'invalid_path' };

    const setId = deriveSetId(ctx, payload);
    const rec = (await getWorkspaceRecord(setId)) || { id: setId, files: [], meta: {} };
    const files = Array.isArray(rec.files) ? rec.files.slice() : [];
    const idx = files.findIndex((f) => f.path === targetPath);
    const original = idx >= 0 ? String(files[idx].content || '') : '';
    let nextContent;
    try {
      nextContent = applyUnifiedDiff(original, payload.diff);
    } catch (e) {
      return { ok: false, error: 'patch_failed', detail: e?.message || String(e) };
    }
    if (idx >= 0) files[idx] = { ...files[idx], content: nextContent };
    else files.push({ path: targetPath, content: nextContent });
    const saved = await saveWorkspaceRecord(setId, files, { ...rec.meta });
    return { ok: true, path: targetPath, applied: true, etag: saved.etag };
  },
});

registerAction('sandbox_exec', {
  schema: z.object({ cmd: z.string(), cwd: z.string().optional(), timeout_ms: z.number().optional() }).optional(),
  handler: async (ctx, payload = {}) => {
    const enabled = process.env.SANDBOX_EXEC_ENABLE === '1';
    if (!enabled) return { ok: false, error: 'sandbox_disabled' };
    const cmd = String(payload?.cmd || '').trim();
    if (!cmd) return { ok: false, error: 'invalid_cmd' };
    // Basic guardrails (no chaining/redirection/subshells)
    const banned = /(\|\||&&|;|\||>|<|`|\$\(|\$\{)/;
    if (banned.test(cmd)) return { ok: false, error: 'cmd_not_allowed' };
    const maxLen = 200;
    if (cmd.length > maxLen) return { ok: false, error: 'cmd_too_long' };
    const timeout = Math.min(Math.max(1000, Number(payload?.timeout_ms || 5000)), 15000);
    try {
      const execOpts = { cwd: process.cwd(), timeout };
      const { stdout, stderr } = await exec(cmd, execOpts);
      const cap = (s) => (s || '').toString().slice(0, 10000);
      return { ok: true, cmd, exitCode: 0, stdout: cap(stdout), stderr: cap(stderr) };
    } catch (e) {
      return { ok: false, error: 'exec_failed', detail: e?.message || String(e) };
    }
  },
});

registerAction('delete_file', {
  schema: z.object({ path: z.string() }),
  handler: async (ctx, payload = {}) => {
    const setId = deriveSetId(ctx, payload);
    const rec = await getWorkspaceRecord(setId);
    const path = normalizePath(payload?.path);
    if (!rec || !path) return { ok: false, error: 'not_found' };
    const nextFiles = (rec.files || []).filter((f) => f.path !== path);
    const next = await saveWorkspaceRecord(setId, nextFiles, { ...rec.meta });
    return { ok: true, path, etag: next.etag };
  },
});

registerAction('move_file', {
  schema: z.object({ from: z.string(), to: z.string() }),
  handler: async (ctx, payload = {}) => {
    const setId = deriveSetId(ctx, payload);
    const rec = await getWorkspaceRecord(setId);
    const from = normalizePath(payload?.from);
    const to = normalizePath(payload?.to);
    if (!rec || !from || !to) return { ok: false, error: 'invalid_path' };
    const files = Array.isArray(rec.files) ? rec.files.slice() : [];
    const idx = files.findIndex((f) => f.path === from);
    if (idx < 0) return { ok: false, error: 'not_found' };
    const existsIdx = files.findIndex((f) => f.path === to);
    const updated = { ...files[idx], path: to };
    if (existsIdx >= 0) files[existsIdx] = updated; else files[idx] = updated;
    const next = await saveWorkspaceRecord(setId, files, { ...rec.meta });
    return { ok: true, from, to, etag: next.etag };
  },
});

registerAction('mkdirs', {
  schema: z.object({ path: z.string() }),
  handler: async (ctx, payload = {}) => {
    const setId = deriveSetId(ctx, payload);
    const rec = (await getWorkspaceRecord(setId)) || (await saveWorkspaceRecord(setId, [], {}));
    const dirPath = normalizePath(payload?.path);
    if (!dirPath) return { ok: false, error: 'invalid_path' };
    const files = Array.isArray(rec.files) ? rec.files.slice() : [];
    const exists = files.some((f) => f.path === dirPath && f.dir === true);
    if (!exists) files.push({ path: dirPath, dir: true, content: '' });
    const next = await saveWorkspaceRecord(setId, files, { ...rec.meta });
    return { ok: true, path: dirPath, etag: next.etag };
  },
});

registerAction('search_text', {
  schema: z.object({ query: z.string(), path: z.string().optional(), max_results: z.number().int().min(1).max(200).optional() }),
  handler: async (ctx, payload = {}) => {
    const setId = deriveSetId(ctx, payload);
    const rec = (await getWorkspaceRecord(setId)) || { id: setId, files: [] };
    const q = String(payload?.query || '').trim();
    if (!q) return { ok: false, error: 'empty_query' };
    const prefix = normalizePath(payload?.path || '/');
    const max = Number.isFinite(payload?.max_results) ? payload.max_results : 100;
    const items = [];
    for (const f of rec.files || []) {
      if (!f?.path || !f?.content) continue;
      if (prefix !== '/' && !f.path.startsWith(prefix)) continue;
      const lines = String(f.content).split(/\r?\n/);
      for (let i = 0; i < lines.length && items.length < max; i++) {
        if (lines[i].includes(q)) {
          items.push({ path: f.path, line: i + 1, text: lines[i] });
        }
      }
      if (items.length >= max) break;
    }
    return { ok: true, items };
  },
});

registerAction('read_file_range', {
  schema: z.object({ path: z.string(), start: z.number().int().min(1).optional(), end: z.number().int().min(1).optional() }),
  handler: async (ctx, payload = {}) => {
    const setId = deriveSetId(ctx, payload);
    const rec = await getWorkspaceRecord(setId);
    const path = normalizePath(payload?.path);
    if (!rec || !path) return { ok: false, error: 'not_found' };
    const f = (rec.files || []).find((x) => x.path === path);
    if (!f) return { ok: false, error: 'not_found' };
    const lines = String(f.content || '').split(/\r?\n/);
    const start = Math.max(1, Number(payload?.start || 1));
    const end = Math.min(lines.length, Number(payload?.end || start + 199));
    const slice = lines.slice(start - 1, end).join('\n');
    return { ok: true, path, start, end, content: slice };
  },
});

registerAction('stat_file', {
  schema: z.object({ path: z.string() }),
  handler: async (ctx, payload = {}) => {
    const setId = deriveSetId(ctx, payload);
    const rec = getSet(setId) || { id: setId, files: [] };
    const path = normalizePath(payload?.path);
    if (!path) return { ok: false, error: 'invalid_path' };
    const f = (rec.files || []).find((x) => x.path === path || (x.dir && path.startsWith(x.path + '/')));
    if (!f) return { ok: false, error: 'not_found' };
    const size = f.dir ? 0 : Buffer.from(String(f.content || ''), 'utf8').length;
    return { ok: true, path, dir: !!f.dir, size };
  },
});

registerAction('delete_dir', {
  schema: z.object({ path: z.string() }),
  handler: async (ctx, payload = {}) => {
    const setId = deriveSetId(ctx, payload);
    const rec = getSet(setId);
    const path = normalizePath(payload?.path);
    if (!rec || !path) return { ok: false, error: 'not_found' };
    const prefix = path.endsWith('/') ? path.slice(0, -1) : path;
    const nextFiles = (rec.files || []).filter((f) => !(f.path === prefix || f.path.startsWith(prefix + '/')));
    const next = await saveWorkspaceRecord(setId, nextFiles, { ...rec.meta });
    return { ok: true, path, etag: next.etag };
  },
});

registerAction('copy_file', {
  schema: z.object({ from: z.string(), to: z.string() }),
  handler: async (ctx, payload = {}) => {
    const setId = deriveSetId(ctx, payload);
    const rec = await getWorkspaceRecord(setId);
    const from = normalizePath(payload?.from);
    const to = normalizePath(payload?.to);
    if (!rec || !from || !to) return { ok: false, error: 'invalid_path' };
    const src = (rec.files || []).find((f) => f.path === from);
    if (!src) return { ok: false, error: 'not_found' };
    const files = Array.isArray(rec.files) ? rec.files.slice() : [];
    const idx = files.findIndex((f) => f.path === to);
    const clone = { ...src, path: to };
    if (idx >= 0) files[idx] = clone; else files.push(clone);
    const next = await saveWorkspaceRecord(setId, files, { ...rec.meta });
    return { ok: true, from, to, etag: next.etag };
  },
});

export default { registerAction, dispatchAction };
