import { supabase } from '../lib/supabase'
import { withTable } from '../lib/supabaseTables'
import { retryAsync } from '../utils/async'

const HERO_COLUMNS = 'id,name,image_url,created_at,owner_id'

export async function fetchHeroesForOwner(ownerId) {
  if (!ownerId) {
    return []
  }

  const result = await retryAsync(
    async () => {
      const response = await withTable(supabase, 'heroes', (table) =>
        supabase
          .from(table)
          .select(HERO_COLUMNS)
          .eq('owner_id', ownerId)
          .order('created_at', { ascending: false }),
      )

      if (response.error) {
        throw response.error
      }

      return response
    },
    {
      retries: 2,
      delay: (attempt) => (attempt + 1) * 300,
      onRetry: (error, attempt) => {
        console.warn('Retrying hero roster fetch', {
          attempt: attempt + 1,
          ownerId,
          error,
        })
      },
    },
  )

  return Array.isArray(result.data) ? result.data : []
}

export async function deleteHeroById(heroId) {
  if (!heroId) {
    throw new Error('삭제할 영웅 ID가 필요합니다.')
  }

  await retryAsync(
    async () => {
      const { error } = await withTable(supabase, 'heroes', (table) =>
        supabase.from(table).delete().eq('id', heroId),
      )

      if (error) {
        throw error
      }
    },
    {
      retries: 1,
      delay: 250,
      onRetry: (error, attempt) => {
        console.warn('Retrying hero deletion', {
          attempt: attempt + 1,
          heroId,
          error,
        })
      },
    },
  )
}
