import { supabase } from '../lib/supabase'
import { withTable } from '../lib/supabaseTables'

const HERO_COLUMNS = 'id,name,image_url,created_at,owner_id'

export async function fetchHeroesForOwner(ownerId) {
  if (!ownerId) {
    return []
  }

  const { data, error } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select(HERO_COLUMNS)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false }),
  )

  if (error) {
    throw error
  }

  return Array.isArray(data) ? data : []
}

export async function deleteHeroById(heroId) {
  if (!heroId) {
    throw new Error('삭제할 영웅 ID가 필요합니다.')
  }

  const { error } = await withTable(supabase, 'heroes', (table) =>
    supabase.from(table).delete().eq('id', heroId),
  )

  if (error) {
    throw error
  }
}
