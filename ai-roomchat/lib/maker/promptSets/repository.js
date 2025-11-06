import { supabase } from '../../supabase';
import { withTableQuery } from '../../supabaseTables';
import { failure, success, asError } from './result';
import { sortPromptSets } from './sort';

export const promptSetsRepository = {
  async list(ownerId) {
    if (!ownerId) {
      return success([]);
    }

    const { data, error } = await withTableQuery(supabase, 'prompt_sets', from =>
      from.select('*').eq('owner_id', ownerId).order('created_at', { ascending: false })
    );

    if (error) {
      return failure(asError(error, '세트를 불러오지 못했습니다.'));
    }

    return success(sortPromptSets(data || []));
  },

  async create(ownerId) {
    if (!ownerId) {
      return failure(new Error('로그인이 필요합니다.'));
    }

    const { data, error } = await withTableQuery(supabase, 'prompt_sets', from =>
      from.insert({ name: '새 세트', owner_id: ownerId }).select().single()
    );

    if (error || !data) {
      return failure(asError(error, '세트를 생성하지 못했습니다.'));
    }

    return success(data);
  },

  async rename(id, nextName) {
    const trimmed = nextName?.trim?.() ?? '';
    if (!trimmed) {
      return failure(new Error('세트 이름을 입력하세요.'));
    }

    const { error } = await withTableQuery(supabase, 'prompt_sets', from =>
      from.update({ name: trimmed }).eq('id', id)
    );

    if (error) {
      return failure(asError(error, '세트 이름을 변경하지 못했습니다.'));
    }

    return success(trimmed);
  },

  async remove(id) {
    // Guard: don't allow delete when set is registered to a game
    try {
      const { data: usageRows, error: usageError } = await withTableQuery(
        supabase,
        'rank_games',
        from => from.select('id').eq('prompt_set_id', id).limit(1)
      );
      if (!usageError) {
        const used = Array.isArray(usageRows)
          ? usageRows.length > 0
          : Boolean(usageRows && usageRows.id);
        if (used) {
          return failure(
            new Error('현재 게임에 등록된 세트는 삭제할 수 없습니다. 먼저 게임 등록을 해제하세요.')
          );
        }
      }
    } catch (e) {
      // If usage check fails unexpectedly, be conservative and block deletion to avoid breaking games
      return failure(
        asError(e, '세트 삭제 사전 검사에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      );
    }

    const { error } = await withTableQuery(supabase, 'prompt_sets', from =>
      from.delete().eq('id', id)
    );

    if (error) {
      return failure(asError(error, '세트를 삭제하지 못했습니다.'));
    }

    // Best-effort: cleanup studio resources under set-scoped folder if any
    try {
      await fetch('/api/storage/delete-prefix', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix: `studio/resources/${id}/`, max: 1000 })
      });
    } catch {}

    return success(true);
  },
};
