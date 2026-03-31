import { supabase } from '../../supabase';
import { withTableQuery } from '../../supabaseTables';
import { failure, success, asError } from './result';
import { sortPromptSets } from './sort';

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
    const { data, error } = await withTableQuery(supabase, 'prompt_sets', from =>
      from.insert({ name: 'New Prompt Set', owner_id: ownerId }).select().single()
    );

    if (error || !data) {
      return failure(asError(error, 'Failed to create a prompt set.'));
    }

    return success(data);
  },

  async rename(id, nextName) {
    const trimmed = nextName?.trim?.() ?? '';
    if (!trimmed) {
      return failure(new Error('Please provide a non-empty prompt set name.'));
    }

    try {
      const resp = await fetch('/api/maker/prompt-sets/rename', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, name: trimmed }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        return failure(asError(j?.error || 'Failed to rename the prompt set.'));
      }
      const payload = await resp.json().catch(() => ({}));
      const name = typeof payload?.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : trimmed;
      return success(name);
    } catch (error) {
      return failure(asError(error, 'Failed to rename the prompt set.'));
    }
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
