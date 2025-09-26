const DEFAULT_PROFILE_BASE = {
  displayName: '사용자',
  avatarUrl: null,
}

export const DEFAULT_PROFILE = Object.freeze({ ...DEFAULT_PROFILE_BASE })

function normaliseEmail(email) {
  if (typeof email !== 'string') return ''
  const [localPart] = email.split('@')
  return localPart || ''
}

export function deriveProfile(user) {
  if (!user) {
    return { ...DEFAULT_PROFILE_BASE }
  }

  const metadata = user.user_metadata || {}
  const displayName =
    metadata.full_name ||
    metadata.name ||
    metadata.nickname ||
    normaliseEmail(user.email) ||
    DEFAULT_PROFILE_BASE.displayName

  const avatarUrl = metadata.avatar_url || metadata.picture || metadata.avatar || null

  return {
    displayName,
    avatarUrl,
  }
}
