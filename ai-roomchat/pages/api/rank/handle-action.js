import { createClient } from '@supabase/supabase-js';
import { dispatchAction } from '@/lib/rank/actions';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withTableQuery } from '@/lib/supabaseTables';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for handle-action API');
}

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
});

// Simple in-memory rate limiter (per user, per action)
const rateMap = new Map(); // key: `${userId}:${action}` -> [timestamps]
const RATE_LIMIT_COUNT = Number(process.env.ACTION_RATE_LIMIT_COUNT || 30);
const RATE_LIMIT_WINDOW_MS = Number(process.env.ACTION_RATE_LIMIT_WINDOW_MS || 10_000);
const NO_RATELIMIT_ACTIONS = new Set([
  'list_files',
  'read_file',
  'read_file_range',
  'stat_file',
  'search_text',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  const user = userData?.user || null;
  if (userError || !user) return res.status(401).json({ error: 'unauthorized' });

  let payload = req.body || {};
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch (err) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
  }

  const {
    action,
    payload: actionPayload = {},
    session_id: sessionId,
    game_id: gameId,
    idempotencyKey,
  } = payload || {};

  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'missing_action' });
  }

  // Normalize common client aliases to server action names
  const ALIASES = {
    runCommand: 'sandbox_exec',
    run_command: 'sandbox_exec',
    sandbox: 'sandbox_exec',
    readFile: 'read_file',
    writeFile: 'write_file',
    editFile: 'edit_patch',
    readDir: 'list_files',
    listFiles: 'list_files',
    deleteFile: 'delete_file',
    removeFile: 'delete_file',
    renameFile: 'move_file',
    moveFile: 'move_file',
    mkdir: 'mkdirs',
    makeDir: 'mkdirs',
    searchFiles: 'search_text',
    grep: 'search_text',
    readRange: 'read_file_range',
  };
  const normalizedAction = ALIASES[action] || action;

  // verify session ownership if sessionId provided
  if (sessionId) {
    const { data: session, error: sessionError } = await withTableQuery(
      supabaseAdmin,
      'rank_sessions',
      from => from.select('id, owner_id, game_id, status').eq('id', sessionId).maybeSingle()
    );
    if (sessionError) return res.status(400).json({ error: sessionError.message });
    if (!session || session.owner_id !== user.id)
      return res.status(403).json({ error: 'forbidden' });
    if (session.status && session.status !== 'active')
      return res.status(409).json({ error: 'session_inactive' });
  }

  // rate limit (skip for read-only style actions)
  const actionNameForLimit = (ALIASES[action] || action);
  if (!NO_RATELIMIT_ACTIONS.has(actionNameForLimit)) {
    try {
      const key = `${String(user.id)}:${actionNameForLimit}`;
      const now = Date.now();
      const arr = rateMap.get(key) || [];
      const pruned = arr.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
      if (pruned.length >= RATE_LIMIT_COUNT) {
        return res.status(429).json({ error: 'rate_limited' });
      }
      pruned.push(now);
      rateMap.set(key, pruned);
    } catch (e) {
      // ignore rate limiter failures
    }
  }

  // idempotency: if idempotencyKey provided, try to find previous execution
  if (idempotencyKey) {
    try {
      const { data: existing, error: exErr } = await withTableQuery(
        supabaseAdmin,
        'rank_action_logs',
        from =>
          supabaseAdmin
            .from(from)
            .select('*')
            .eq('request_id', idempotencyKey)
            .limit(1)
            .maybeSingle()
      );
      if (exErr) {
        console.warn('[handle-action] idempotency lookup failed', exErr);
      } else if (existing) {
        // return previous result
        return res
          .status(200)
          .json({ ok: true, result: existing.result || null, alreadyApplied: true });
      }
    } catch (err) {
      console.warn('[handle-action] idempotency check error', err?.message || err);
    }
  }

  // dispatch
  try {
    const result = await dispatchAction({
      name: normalizedAction,
      user,
      sessionId,
      gameId,
      payload: actionPayload,
      idempotencyKey,
    });
    if (!result || result.ok === false) {
      // write audit failure
      try {
        await withTableQuery(supabaseAdmin, 'rank_action_logs', from =>
          supabaseAdmin.from(from).insert({
            request_id: idempotencyKey || null,
            session_id: sessionId || null,
            user_id: user?.id || null,
            action_name: normalizedAction,
            payload: actionPayload || {},
            result: null,
            ok: false,
            error: result?.error || 'action_failed',
          })
        );
      } catch (err) {
        console.warn('[handle-action] audit insert failed', err?.message || err);
      }

      return res.status(400).json({ error: result?.error || 'action_failed' });
    }

    // write audit success
    try {
      await withTableQuery(supabaseAdmin, 'rank_action_logs', from =>
        supabaseAdmin.from(from).insert({
          request_id: idempotencyKey || null,
          session_id: sessionId || null,
          user_id: user?.id || null,
          action_name: normalizedAction,
          payload: actionPayload || {},
          result: result.result || null,
          ok: true,
        })
      );
    } catch (err) {
      console.warn('[handle-action] audit insert failed', err?.message || err);
    }

    return res
      .status(200)
      .json({ ok: true, result: result.result || null, changes: result.changes || null });
  } catch (err) {
    console.error('[handle-action] error', err);
    try {
      await withTableQuery(supabaseAdmin, 'rank_action_logs', from =>
        supabaseAdmin.from(from).insert({
          request_id: idempotencyKey || null,
          session_id: sessionId || null,
          user_id: user?.id || null,
          action_name: action,
          payload: actionPayload || {},
          result: null,
          ok: false,
          error: err?.message || 'internal_error',
        })
      );
    } catch (e) {
      console.warn('[handle-action] audit insert failed', e?.message || e);
    }
    return res.status(500).json({ error: err?.message || 'internal_error' });
  }
}
