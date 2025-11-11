// Workspace set item handler (in-memory dev store).
import { ensure, upsert, remove, create } from '../../../../lib/workspace/setsStore';
import { buildStarterPack } from '../../../../lib/workspace/getStarterPackFiles';
import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/ssr';
import logger from '../../../../lib/logger';
import { z } from 'zod';

// Limit bodyParser size to avoid accidental large uploads from clients.
export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

function json(res, status, data) {
  // Include charset and use a consistent JSON response helper.
  // Prefer res.json when available (tests/mocks), otherwise write raw.
  if (typeof res.json === 'function') {
    res.status(status).setHeader && res.setHeader && res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.json(data);
  }
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

const STARTER_ROOT = process.env.WORKSPACE_STARTER_ROOT || process.cwd();
let starterCache = null;

function starterFiles() {
  if (starterCache) return starterCache;
  try {
    const files = buildStarterPack(STARTER_ROOT);
    starterCache = Array.isArray(files) ? files : [];
  } catch {
    starterCache = [];
  }
  return starterCache;
}

function parseIfMatch(req) {
  const raw = req?.headers?.['if-match'];
  if (!raw) return null;
  // Honor first token if multiple values supplied.
  const token = String(raw).split(',')[0].trim();
  if (!token) return null;
  // Wildcard: If-Match: *
  if (token === '*') return '*';
  // Strip surrounding quotes if provided (but keep internal W/"..." form).
  return token.replace(/^"(.*)"$/, '$1');
}

async function resolveUser(req, res) {
  // Test helper: allow tests to set the user via header when NODE_ENV=test
  try {
    const testUser = req.headers && (req.headers['x-test-user'] || req.headers['X-Test-User']);
    if (process.env.NODE_ENV === 'test' && testUser) {
      return { user: { id: String(testUser) } };
    }
  } catch (e) {
    // ignore
  }
  try {
    const supabase = createPagesServerClient({ req, res });
    const { data: { user } = {} } = await supabase.auth.getUser();
    if (user) return { user };
  } catch (e) {
    // ignore cookie/session errors and try header token fallback
    try { logger.warn('[sets] session resolve failed:', e && e.message); } catch (_) {}
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { user: null };

  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    try {
      const anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
      const { data, error } = await anonClient.auth.getUser(token);
      if (!error && data?.user) return { user: data.user };
    } catch (e) {
      try { logger.warn('[sets] token user resolve failed:', e && e.message); } catch (_) {}
    }
  }

  return { user: null };
}

function ensureWithStarter(id, userId) {
  const existing = ensure(id);
  if (existing) return existing;
  const meta = { seeded: true };
  const owner = userId || null;
  return create(id, { files: starterFiles(), meta, owner });
}

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id || Array.isArray(id)) return json(res, 400, { error: 'bad id' });

  // Validate id shape
  const idSchema = z.string().min(1).max(200).regex(/^[^\s/]+$/);
  const idCheck = idSchema.safeParse(String(id));
  if (!idCheck.success) return json(res, 400, { error: 'invalid id' });

  // Require authenticated user for workspace set operations.
  const { user } = await resolveUser(req, res);
  if (!user) return json(res, 401, { error: 'missing_user_id' });

  if (req.method === 'GET') {
    try {
  const out = ensureWithStarter(id, user.id);
  // If a record exists and has an owner, enforce ownership
  if (out?.owner && out.owner !== user.id) return json(res, 403, { error: 'forbidden' });
      if (out?.etag) res.setHeader('ETag', out.etag);
      return json(res, 200, out);
    } catch (e) {
      // Log server-side errors for debugging/monitoring.
      logger.error('GET /api/workspace/sets/[id] error', e);
      return json(res, 500, { error: e.message || 'failed to load set' });
    }
  }
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const ifMatch = parseIfMatch(req);
    const merge = req.method === 'PATCH';
    try {
      // Parse and validate body (defensive). Reject invalid payloads early.
      let payload = req.body;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload || '{}');
        } catch (err) {
          return json(res, 400, { error: 'invalid_payload' });
        }
      }
      const fileSchema = z.object({
        path: z.string().min(1),
        content: z.string().optional(),
        readonly: z.boolean().optional(),
        dir: z.boolean().optional(),
      });
      const bodySchema = z.object({ files: z.array(fileSchema).optional(), meta: z.record(z.any()).optional() }).strict();
      const parsed = bodySchema.safeParse(payload || {});
      if (!parsed.success) {
        return json(res, 400, { error: 'invalid_payload', detail: parsed.error.errors });
      }
      // Ownership check: if existing and owner !== user.id, forbid.
  const existing = ensure(id);
  if (existing?.owner && existing.owner !== user.id) return json(res, 403, { error: 'forbidden' });
      // Ensure new records are assigned to the requesting user
      const safePayload = { ...(parsed.success ? parsed.data : {} ) };
      // Prevent client from setting owner directly
      delete safePayload.owner;
      safePayload.meta = { ...(safePayload.meta || {}) };
      if (!existing) safePayload.owner = user.id;

      const out = upsert(id, safePayload, { ifMatch, merge });
      if (out?.etag) res.setHeader('ETag', out.etag);
      return json(res, 200, out);
    } catch (e) {
      logger.error('PUT/PATCH /api/workspace/sets/[id] error', e);
      if (e.code === 'ETAG_MISMATCH') {
        if (e.currentEtag) res.setHeader('ETag', e.currentEtag);
        return json(res, 412, { error: 'etag mismatch', etag: e.currentEtag || null });
      }
      const status = typeof e.status === 'number' ? e.status : 500;
      return json(res, status, { error: e.message || 'failed to save set' });
    }
  }
  if (req.method === 'DELETE') {
    try {
      // Ownership check before delete
      const existing = ensure(id);
  if (!existing) return json(res, 404, { error: 'not found' });
  // debug log for ownership checks (tests can enable NODE_ENV=test)
  logger.debug && logger.debug('DELETE ownership check', { existingOwner: existing?.owner, user: user?.id });
  if (existing?.owner && existing.owner !== user.id) return json(res, 403, { error: 'forbidden' });
      // remove may return truthy when an item was removed; handle not-found gracefully.
      const removed = remove(id);
  if (!removed) return json(res, 404, { error: 'not found' });
  if (typeof res.end === 'function') return res.status(204).end();
  if (typeof res.send === 'function') return res.status(204).send('');
  res.statusCode = 204;
  return res;
    } catch (e) {
      logger.error('DELETE /api/workspace/sets/[id] error', e);
      return json(res, 500, { error: e.message || 'failed to delete set' });
    }
  }
  res.setHeader('Allow', 'GET, PUT, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
