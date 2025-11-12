import { supabase } from '../../supabase';
import { withTableQuery } from '../../supabaseTables';
import { failure, success, asError } from './result';
import { sortPromptSets } from './sort';

const CREATE_DEDUPE_WINDOW_MS = 3000;
const inflightCreate = new Map(); // ownerId -> Promise
const recentCreate = new Map(); // ownerId -> { at, data }

export const promptSetsRepository = {
  async list(ownerId) {
    if (!ownerId) {
      return success([]);
    }

    const { data, error } = await withTableQuery(supabase, 'prompt_sets', (from) =>
      from.select('*').eq('owner_id', ownerId).order('created_at', { ascending: false })
    );

    if (error) {
      return failure(asError(error, 'Failed to load prompt sets.'));
    }

    return success(sortPromptSets(data || []));
  },

  async create(ownerId) {
    if (!ownerId) {
      return failure(new Error('Login is required to create a prompt set.'));
    }

    const now = Date.now();
    const recent = recentCreate.get(ownerId);
    if (recent && now - recent.at < CREATE_DEDUPE_WINDOW_MS) {
      return success(recent.data);
    }

    if (inflightCreate.has(ownerId)) {
      return inflightCreate.get(ownerId);
    }

    const createPromise = (async () => {
      const { data, error } = await withTableQuery(supabase, 'prompt_sets', (from) =>
        from.insert({ name: 'New Prompt Set', owner_id: ownerId }).select().single()
      );

      if (error || !data) {
        return failure(asError(error, 'Failed to create a prompt set.'));
      }

      recentCreate.set(ownerId, { at: Date.now(), data });

      try {
        const cutoffIso = new Date(Date.now() - CREATE_DEDUPE_WINDOW_MS).toISOString();
        await withTableQuery(supabase, 'prompt_sets', (from) =>
          from
            .delete()
            .eq('owner_id', ownerId)
            .neq('id', data.id)
            .gte('created_at', cutoffIso)
        );
      } catch (cleanupError) {
        console.warn('[promptSetsRepository] duplicate cleanup failed', cleanupError);
      }

      return success(data);
    })();

    inflightCreate.set(ownerId, createPromise);
    try {
      return await createPromise;
    } finally {
      inflightCreate.delete(ownerId);
    }
  },

  async rename(id, nextName) {
    const trimmed = nextName?.trim?.() ?? '';
    if (!trimmed) {
      return failure(new Error('Please provide a non-empty prompt set name.'));
    }

    const { error } = await withTableQuery(supabase, 'prompt_sets', (from) =>
      from.update({ name: trimmed }).eq('id', id)
    );

    if (error) {
      return failure(asError(error, 'Failed to rename the prompt set.'));
    }

    return success(trimmed);
  },

  async remove(id) {
    try {
      const resp = await fetch('/api/maker/prompt-sets/remove', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (resp.ok) {
        return success(true);
      }
      const j = await resp.json().catch(() => ({}));
      return failure(asError(j?.error || 'Failed to remove the prompt set.'));
    } catch (e) {
      try {
        const { data: usageRows, error: usageError } = await withTableQuery(
          supabase,
          'rank_games',
          (from) => from.select('id').eq('prompt_set_id', id).limit(1)
        );
        if (!usageError) {
          const used = Array.isArray(usageRows)
            ? usageRows.length > 0
            : Boolean(usageRows && usageRows.id);
          if (used) {
            return failure(
              new Error('This prompt set is in use. Remove it from any active games first.')
            );
          }
        }
      } catch (pre) {
        return failure(asError(pre, 'Could not verify prompt set usage. Please retry.'));
      }

      const { error } = await withTableQuery(supabase, 'prompt_sets', (from) =>
        from.delete().eq('id', id)
      );
      if (error) {
        return failure(asError(error, 'Failed to delete the prompt set.'));
      }

      try {
        await fetch('/api/storage/delete-prefix', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prefix: `studio/resources/${id}/`, max: 1000 }),
        });
      } catch {}

      try {
        for (let i = 0; i < 5; i += 1) {
          const resp = await fetch('/api/storage/delete-by-set', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ setId: id, totalLimit: 5000, pageSize: 1000 }),
          });
          if (!resp.ok) break;
          const j = await resp.json().catch(() => ({ deleted: 0 }));
          if (!j || !j.deleted || j.deleted <= 0) break;
        }
      } catch {}

      return success(true);
    }
  },
};
