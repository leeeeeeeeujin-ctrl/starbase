import { supabase } from '../lib/supabase'
import { withTable } from '../lib/supabaseTables'

const HERO_COLUMNS = 'id,name,image_url,created_at,owner_id'
const FALLBACK_NAME = '이름 없는 영웅'

export function normaliseHero(record) {
  if (!record || typeof record !== 'object') {
    return null
  }

  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : FALLBACK_NAME

  return {
    id: record.id,
    name,
    image_url: record.image_url || null,
    created_at: record.created_at || null,
    owner_id: record.owner_id || null,
  }
}

export async function fetchHeroesByOwner(ownerId) {
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

  return (Array.isArray(data) ? data : []).map(normaliseHero).filter(Boolean)
}

export async function deleteHeroById(heroId) {
  if (!heroId) return
  const { error } = await withTable(supabase, 'heroes', (table) => supabase.from(table).delete().eq('id', heroId))
  if (error) {
    throw error
  }
}
