import { supabase } from '../supabase'
import { withTableQuery } from '../supabaseTables'
import { insertPromptSetBundle, readPromptSetBundle } from './promptSets/bundle'
import { asError, failure, success } from './promptSets/result'

const LIBRARY_SELECT =
  'id,title,summary,download_count,created_at,owner_id,profiles:owner_id(username,avatar_url)'

export async function listPromptLibraryEntries({ limit = 12 } = {}) {
  const { data, error } = await withTableQuery(supabase, 'prompt_library_entries', (from) =>
    from
      .select(LIBRARY_SELECT)
      .order('download_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
  )

  if (error) {
    return failure(asError(error, '공유 프롬프트를 불러오지 못했습니다.'))
  }

  return success(data || [])
}

export async function publishPromptSetToLibrary(userId, setId) {
  if (!userId) {
    return failure(new Error('로그인이 필요합니다.'))
  }

  const { data: setRow, error: setError } = await withTableQuery(
    supabase,
    'prompt_sets',
    (from) => from.select('*').eq('id', setId).single(),
  )

  if (setError || !setRow) {
    return failure(asError(setError, '세트를 찾지 못했습니다.'))
  }

  if (setRow.owner_id !== userId) {
    return failure(new Error('내 세트만 공유할 수 있습니다.'))
  }

  const bundleResult = await readPromptSetBundle(setId)
  if (bundleResult.error) {
    return bundleResult
  }

  const payload = bundleResult.data ?? {}

  const { data, error: upsertError } = await withTableQuery(
    supabase,
    'prompt_library_entries',
    (from) =>
      from
        .upsert(
          {
            owner_id: userId,
            set_id: setId,
            title: setRow.name || '공유 세트',
            summary: setRow.description || '',
            payload,
          },
          { onConflict: 'set_id' },
        )
        .select(LIBRARY_SELECT)
        .single(),
  )

  if (upsertError) {
    return failure(asError(upsertError, '서버에 업로드하지 못했습니다.'))
  }

  return success(data)
}

export async function importPromptLibraryEntry(userId, entryId) {
  if (!userId) {
    return failure(new Error('로그인이 필요합니다.'))
  }

  const { data: entry, error } = await withTableQuery(
    supabase,
    'prompt_library_entries',
    (from) =>
      from.select('id,title,payload,download_count').eq('id', entryId).single(),
  )

  if (error || !entry) {
    return failure(asError(error, '공유 프롬프트를 찾지 못했습니다.'))
  }

  const insertResult = await insertPromptSetBundle(userId, entry.payload)
  if (insertResult.error) {
    return insertResult
  }

  await supabase.rpc('increment_prompt_library_downloads', { entry_id: entry.id })

  return success({ entry, createdSet: insertResult.data })
}
