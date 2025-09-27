const DEFAULT_PROFILE_NAME = '사용자'

export const DEFAULT_PROFILE = Object.freeze({
  displayName: DEFAULT_PROFILE_NAME,
  avatarUrl: null,
})

export function deriveProfile(user) {
  if (!user) {
    return { ...DEFAULT_PROFILE }
  }

  const metadata = user.user_metadata || {}
  const emailPrefix = typeof user.email === 'string' ? user.email.split('@')[0] : ''

  const displayName =
    metadata.full_name ||
    metadata.name ||
    metadata.nickname ||
    metadata.preferred_username ||
    emailPrefix ||
    DEFAULT_PROFILE_NAME

  const avatarUrl = metadata.avatar_url || metadata.picture || metadata.avatar || null

  return { displayName, avatarUrl }
}
