import { supabase } from '../lib/supabase'
import { withTable } from '../lib/supabaseTables'

const PROFILE_COLUMNS = 'id,username,avatar_url'

function normaliseProfile(row) {
  if (!row) return null
  return {
    id: row.id || null,
    username: typeof row.username === 'string' ? row.username.trim() : '',
    avatar_url: row.avatar_url || null,
  }
}

export async function fetchProfileById(userId) {
  if (!userId) return null

  const { data, error } = await withTable(supabase, 'profiles', (table) =>
    supabase
      .from(table)
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .limit(1)
      .maybeSingle(),
  )

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw error
  }

  return normaliseProfile(data)
}

export function deriveRosterProfile({ profileRow, authProfile, user }) {
  const username = profileRow?.username
  const metadataName = authProfile?.displayName
  const fallbackEmail = typeof user?.email === 'string' ? user.email.split('@')[0] : ''

  const displayName = username || metadataName || fallbackEmail || '사용자'
  const avatarUrl = profileRow?.avatar_url || authProfile?.avatarUrl || null

  return { displayName, avatarUrl }
}
