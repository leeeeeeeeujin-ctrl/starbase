import { supabase } from '../../supabase'
import { failure, success, asError } from './result'
import { sortPromptSets } from './sort'

export const promptSetsRepository = {
  async list(ownerId) {
    if (!ownerId) {
      return success([])
    }

    const { data, error } = await supabase
      .from('prompt_sets')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })

    if (error) {
      return failure(asError(error, '세트를 불러오지 못했습니다.'))
    }

    return success(sortPromptSets(data || []))
  },

  async create(ownerId) {
    if (!ownerId) {
      return failure(new Error('로그인이 필요합니다.'))
    }

    const { data, error } = await supabase
      .from('prompt_sets')
      .insert({ name: '새 세트', owner_id: ownerId })
      .select()
      .single()

    if (error || !data) {
      return failure(asError(error, '세트를 생성하지 못했습니다.'))
    }

    return success(data)
  },

  async rename(id, nextName) {
    const trimmed = nextName?.trim?.() ?? ''
    if (!trimmed) {
      return failure(new Error('세트 이름을 입력하세요.'))
    }

    const { error } = await supabase.from('prompt_sets').update({ name: trimmed }).eq('id', id)

    if (error) {
      return failure(asError(error, '세트 이름을 변경하지 못했습니다.'))
    }

    return success(trimmed)
  },

  async remove(id) {
    const { error } = await supabase.from('prompt_sets').delete().eq('id', id)

    if (error) {
      return failure(asError(error, '세트를 삭제하지 못했습니다.'))
    }

    return success(true)
  },
}
