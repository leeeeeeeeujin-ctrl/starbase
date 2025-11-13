import { withTableQuery } from '@/lib/supabaseTables';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { z } from 'zod';

const registry = new Map();

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
registerAction('list_files', {
  handler: async () => ({ ok: true, items: [] }),
});

registerAction('read_file', {
  handler: async (ctx, payload = {}) => ({ ok: true, path: payload?.path || '', content: '' }),
});

registerAction('write_file', {
  handler: async (ctx, payload = {}) => ({ ok: true, path: payload?.path || '', bytes: (payload?.content||'').length }),
});

registerAction('edit_patch', {
  handler: async (ctx, payload = {}) => ({ ok: true, path: payload?.path || '', applied: false }),
});

registerAction('sandbox_exec', {
  handler: async (ctx, payload = {}) => ({ ok: true, cmd: payload?.cmd || '', exitCode: 0, stdout: '', stderr: '' }),
});

export default { registerAction, dispatchAction };
